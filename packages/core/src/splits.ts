import { db } from "@fintrack/db";
import { categories, transactionSplits, transactions } from "@fintrack/db/schema";
import type { TransactionSplitWithCategory } from "@fintrack/shared/types";
import { transactionSplitsSchema } from "@fintrack/shared/validators";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { NotFoundError, ValidationError } from "./errors";

type Batch = [BatchItem<"pg">, ...BatchItem<"pg">[]];

// Decimal(12,2) storage means the parts can be off by rounding only
const SPLIT_SUM_TOLERANCE = 0.005;

function splitsMatchTotal(total: number, splits: { amount: string }[]): boolean {
    const sum = splits.reduce((acc, split) => acc + Number(split.amount), 0);
    return Math.abs(total - sum) <= SPLIT_SUM_TOLERANCE;
}

export async function getSplitsForTransactions(
    transactionIds: string[]
): Promise<Map<string, TransactionSplitWithCategory[]>> {
    const byTransaction = new Map<string, TransactionSplitWithCategory[]>();
    if (transactionIds.length === 0) return byTransaction;

    const rows = await db
        .select({
            id: transactionSplits.id,
            transactionId: transactionSplits.transactionId,
            categoryId: transactionSplits.categoryId,
            amount: transactionSplits.amount,
            note: transactionSplits.note,
            createdAt: transactionSplits.createdAt,
            category: {
                id: categories.id,
                name: categories.name,
                icon: categories.icon,
                color: categories.color,
            },
        })
        .from(transactionSplits)
        .innerJoin(categories, eq(transactionSplits.categoryId, categories.id))
        .where(inArray(transactionSplits.transactionId, transactionIds))
        .orderBy(asc(transactionSplits.createdAt), asc(transactionSplits.id));

    for (const row of rows) {
        const list = byTransaction.get(row.transactionId);
        if (list) list.push(row);
        else byTransaction.set(row.transactionId, [row]);
    }
    return byTransaction;
}

export async function getSplits(userId: string, transactionId: string) {
    const [txn] = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
        .limit(1);
    if (!txn) throw new NotFoundError("Transaction not found");

    const map = await getSplitsForTransactions([transactionId]);
    return map.get(transactionId) ?? [];
}

// An empty list removes every split
export async function replaceSplits(userId: string, transactionId: string, data: unknown) {
    const { splits } = transactionSplitsSchema.parse(data);

    const [txn] = await db
        .select({ id: transactions.id, type: transactions.type, amount: transactions.amount })
        .from(transactions)
        .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
        .limit(1);
    if (!txn) throw new NotFoundError("Transaction not found");

    if (splits.length > 0) {
        if (txn.type === "transfer") {
            throw new ValidationError("Transfers cannot be split across categories");
        }

        const categoryIds = [...new Set(splits.map((s) => s.categoryId))];
        const owned = await db
            .select({ id: categories.id })
            .from(categories)
            .where(and(inArray(categories.id, categoryIds), eq(categories.userId, userId)));
        if (owned.length !== categoryIds.length) {
            throw new NotFoundError("Category not found");
        }

        if (!splitsMatchTotal(Number(txn.amount), splits)) {
            throw new ValidationError(
                `Split amounts must add up to the transaction amount (${txn.amount})`
            );
        }
    }

    const writes: Batch = [
        db.delete(transactionSplits).where(eq(transactionSplits.transactionId, transactionId)),
    ];
    if (splits.length > 0) {
        writes.push(
            db.insert(transactionSplits).values(
                splits.map((split) => ({
                    transactionId,
                    categoryId: split.categoryId,
                    amount: Number(split.amount).toFixed(2),
                    note: split.note,
                }))
            )
        );
    }
    await db.batch(writes);

    const map = await getSplitsForTransactions([transactionId]);
    return map.get(transactionId) ?? [];
}
