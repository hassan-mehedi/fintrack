import { db } from "@fintrack/db";
import { categories, financialAccounts, transactions } from "@fintrack/db/schema";
import { importTransactionsSchema } from "@fintrack/shared/validators";
import { and, eq, gte, lte } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getBalanceDelta } from "./balance";
import { NotFoundError } from "./errors";
import { balanceUpdate } from "./transactions";

type Batch = [BatchItem<"pg">, ...BatchItem<"pg">[]];

const CHUNK_SIZE = 200;
const FALLBACK_CATEGORY_NAME = "Imported";

export interface DuplicateKeyFields {
    date: string;
    amount: string | number;
    type: string;
    description: string | null;
}

export function duplicateKey(row: DuplicateKeyFields): string {
    return [
        row.date,
        Number(row.amount).toFixed(2),
        row.type,
        (row.description ?? "").trim().toLowerCase(),
    ].join("|");
}

function categoryKey(name: string | null | undefined) {
    return (name?.trim() || FALLBACK_CATEGORY_NAME).toLowerCase();
}

export async function importTransactions(userId: string, data: unknown) {
    const parsed = importTransactionsSchema.parse(data);

    const [account] = await db
        .select({ id: financialAccounts.id, type: financialAccounts.type })
        .from(financialAccounts)
        .where(
            and(eq(financialAccounts.id, parsed.accountId), eq(financialAccounts.userId, userId))
        )
        .limit(1);
    if (!account) throw new NotFoundError("Account not found");

    const existingCategories = await db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.userId, userId));
    const categoryIdByKey = new Map(existingCategories.map((c) => [categoryKey(c.name), c.id]));

    const missing = new Map<string, { name: string; types: Set<"income" | "expense"> }>();
    for (const row of parsed.rows) {
        const key = categoryKey(row.categoryName);
        if (categoryIdByKey.has(key)) continue;
        const entry = missing.get(key);
        if (entry) entry.types.add(row.type);
        else
            missing.set(key, {
                name: row.categoryName?.trim() || FALLBACK_CATEGORY_NAME,
                types: new Set([row.type]),
            });
    }

    const createdCategories: string[] = [];
    if (missing.size > 0) {
        const inserted = await db
            .insert(categories)
            .values(
                [...missing.values()].map(({ name, types }) => ({
                    userId,
                    name,
                    type: types.size > 1 ? ("both" as const) : [...types][0],
                    isDefault: false,
                }))
            )
            .returning({ id: categories.id, name: categories.name });
        for (const category of inserted) {
            categoryIdByKey.set(categoryKey(category.name), category.id);
            createdCategories.push(category.name);
        }
    }

    let rows = parsed.rows;
    let skipped = 0;
    if (parsed.skipDuplicates) {
        const dates = rows.map((r) => r.date).sort();
        const existing = await db
            .select({
                date: transactions.date,
                amount: transactions.amount,
                type: transactions.type,
                description: transactions.description,
            })
            .from(transactions)
            .where(
                and(
                    eq(transactions.userId, userId),
                    eq(transactions.accountId, parsed.accountId),
                    gte(transactions.date, dates[0]),
                    lte(transactions.date, dates[dates.length - 1])
                )
            );
        const existingKeys = new Set(existing.map(duplicateKey));
        rows = rows.filter((row) => !existingKeys.has(duplicateKey(row)));
        skipped = parsed.rows.length - rows.length;
    }

    if (rows.length === 0) return { imported: 0, skipped, createdCategories };

    const values = rows.map((row) => ({
        userId,
        accountId: parsed.accountId,
        categoryId: categoryIdByKey.get(categoryKey(row.categoryName))!,
        amount: Number(row.amount).toFixed(2),
        fee: "0",
        type: row.type,
        description: row.description,
        date: row.date,
        tags: row.tags,
    }));

    // Each chunk carries its own balance delta so every batch leaves the account consistent
    for (let start = 0; start < values.length; start += CHUNK_SIZE) {
        const chunk = values.slice(start, start + CHUNK_SIZE);
        const delta = chunk.reduce(
            (sum, row) => sum + getBalanceDelta(account.type, row.type, Number(row.amount), 0),
            0
        );
        const writes: Batch = [
            db.insert(transactions).values(chunk),
            balanceUpdate(parsed.accountId, delta),
        ];
        await db.batch(writes);
    }

    return { imported: values.length, skipped, createdCategories };
}
