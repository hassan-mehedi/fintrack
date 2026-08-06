import { db } from "@fintrack/db";
import {
    categories,
    financialAccounts,
    transactions,
} from "@fintrack/db/schema";
import { transactionSchema } from "@fintrack/shared/validators";
import { and, desc, eq, gte, ilike, inArray, lte, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getBalanceDelta, getTransferDeltas } from "./balance";
import { NotFoundError, ValidationError } from "./errors";

type Batch = [BatchItem<"pg">, ...BatchItem<"pg">[]];

export interface TransactionFilters {
    type?: string;
    categoryId?: string;
    accountId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    limit?: number;
}

async function getAccountTypes(ids: string[]): Promise<Map<string, string>> {
    const rows = await db
        .select({ id: financialAccounts.id, type: financialAccounts.type })
        .from(financialAccounts)
        .where(inArray(financialAccounts.id, ids));
    return new Map(rows.map((r) => [r.id, r.type]));
}

// Balances are plain numbers with no exchange rate attached, so moving money
// between accounts in different currencies would silently corrupt both sides.
async function assertSameCurrency(sourceId: string, destId: string) {
    const rows = await db
        .select({ id: financialAccounts.id, currency: financialAccounts.currency })
        .from(financialAccounts)
        .where(inArray(financialAccounts.id, [sourceId, destId]));
    const currencies = new Map(rows.map((r) => [r.id, r.currency]));
    if (currencies.get(sourceId) !== currencies.get(destId)) {
        throw new ValidationError(
            "These accounts use different currencies. Record the conversion as an expense on one side and an income on the other instead."
        );
    }
}

function balanceUpdate(accountId: string, delta: number) {
    return db
        .update(financialAccounts)
        .set({
            balance: sql`${financialAccounts.balance}::numeric + ${delta}`,
            updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, accountId));
}

function filterConditions(userId: string, filters?: TransactionFilters) {
    const conditions = [eq(transactions.userId, userId)];

    if (filters?.type) {
        conditions.push(
            eq(transactions.type, filters.type as "income" | "expense" | "transfer")
        );
    }
    if (filters?.categoryId) {
        conditions.push(eq(transactions.categoryId, filters.categoryId));
    }
    if (filters?.accountId) {
        conditions.push(eq(transactions.accountId, filters.accountId));
    }
    if (filters?.startDate) {
        conditions.push(gte(transactions.date, filters.startDate));
    }
    if (filters?.endDate) {
        conditions.push(lte(transactions.date, filters.endDate));
    }
    if (filters?.search) {
        conditions.push(ilike(transactions.description, `%${filters.search}%`));
    }

    return conditions;
}

export async function getTransactions(userId: string, filters?: TransactionFilters) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;

    const conditions = filterConditions(userId, filters);

    const [data, [countResult]] = await Promise.all([
        db
            .select({
                id: transactions.id,
                amount: transactions.amount,
                fee: transactions.fee,
                type: transactions.type,
                description: transactions.description,
                date: transactions.date,
                tags: transactions.tags,
                categoryId: transactions.categoryId,
                categoryName: categories.name,
                categoryIcon: categories.icon,
                categoryColor: categories.color,
                accountId: transactions.accountId,
                accountName: financialAccounts.name,
                toAccountId: transactions.toAccountId,
                createdAt: transactions.createdAt,
            })
            .from(transactions)
            .innerJoin(categories, eq(transactions.categoryId, categories.id))
            .innerJoin(
                financialAccounts,
                eq(transactions.accountId, financialAccounts.id)
            )
            .where(and(...conditions))
            .orderBy(desc(transactions.date), desc(transactions.createdAt))
            .limit(limit)
            .offset(offset),
        db
            .select({ count: sql<number>`count(*)` })
            .from(transactions)
            .where(and(...conditions)),
    ]);

    return {
        transactions: data.map((t) => ({
            ...t,
            amount: Number(t.amount),
            fee: Number(t.fee),
        })),
        total: Number(countResult.count),
        page,
        totalPages: Math.ceil(Number(countResult.count) / limit),
    };
}

export async function createTransaction(userId: string, data: unknown) {
    const parsed = transactionSchema.parse(data);
    const amount = Number(parsed.amount);
    const fee = Number(parsed.fee || 0);

    const insertTxn = db
        .insert(transactions)
        .values({
            userId,
            accountId: parsed.accountId,
            toAccountId: parsed.toAccountId || null,
            categoryId: parsed.categoryId,
            amount: parsed.amount,
            fee: parsed.fee || "0",
            type: parsed.type,
            description: parsed.description || "",
            date: parsed.date,
            tags: parsed.tags || [],
        })
        .returning();

    const writes: Batch = [insertTxn];

    if (parsed.type === "income" || parsed.type === "expense") {
        const types = await getAccountTypes([parsed.accountId]);
        const delta = getBalanceDelta(
            types.get(parsed.accountId)!, parsed.type, amount, fee
        );
        writes.push(balanceUpdate(parsed.accountId, delta));
    } else if (parsed.type === "transfer" && parsed.toAccountId) {
        await assertSameCurrency(parsed.accountId, parsed.toAccountId);
        const types = await getAccountTypes([parsed.accountId, parsed.toAccountId]);
        const { sourceDelta, destDelta } = getTransferDeltas(
            types.get(parsed.accountId)!, types.get(parsed.toAccountId)!, amount, fee
        );
        writes.push(balanceUpdate(parsed.accountId, sourceDelta));
        writes.push(balanceUpdate(parsed.toAccountId, destDelta));
    }

    const [inserted] = await db.batch(writes);
    return inserted[0];
}

export async function updateTransaction(userId: string, id: string, data: unknown) {
    const parsed = transactionSchema.parse(data);
    const newAmount = Number(parsed.amount);
    const newFee = Number(parsed.fee || 0);

    const [oldTxn] = await db
        .select()
        .from(transactions)
        .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
        .limit(1);

    if (!oldTxn) throw new NotFoundError("Transaction not found");

    const oldAmount = Number(oldTxn.amount);
    const oldFee = Number(oldTxn.fee);

    if (parsed.type === "transfer" && parsed.toAccountId) {
        await assertSameCurrency(parsed.accountId, parsed.toAccountId);
    }

    const ids = [oldTxn.accountId, parsed.accountId];
    if (oldTxn.toAccountId) ids.push(oldTxn.toAccountId);
    if (parsed.toAccountId) ids.push(parsed.toAccountId);
    const types = await getAccountTypes(ids);

    const updateTxn = db
        .update(transactions)
        .set({
            accountId: parsed.accountId,
            toAccountId: parsed.toAccountId || null,
            categoryId: parsed.categoryId,
            amount: parsed.amount,
            fee: parsed.fee || "0",
            type: parsed.type,
            description: parsed.description || "",
            date: parsed.date,
            tags: parsed.tags || [],
            updatedAt: new Date(),
        })
        .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
        .returning();

    const writes: Batch = [updateTxn];

    // Reverse old balance effects
    if (oldTxn.type === "income" || oldTxn.type === "expense") {
        const oldDelta = getBalanceDelta(
            types.get(oldTxn.accountId)!, oldTxn.type, oldAmount, oldFee
        );
        writes.push(balanceUpdate(oldTxn.accountId, -oldDelta));
    } else if (oldTxn.type === "transfer" && oldTxn.toAccountId) {
        const { sourceDelta, destDelta } = getTransferDeltas(
            types.get(oldTxn.accountId)!, types.get(oldTxn.toAccountId)!, oldAmount, oldFee
        );
        writes.push(balanceUpdate(oldTxn.accountId, -sourceDelta));
        writes.push(balanceUpdate(oldTxn.toAccountId, -destDelta));
    }

    // Apply new balance effects
    if (parsed.type === "income" || parsed.type === "expense") {
        const newDelta = getBalanceDelta(
            types.get(parsed.accountId)!, parsed.type, newAmount, newFee
        );
        writes.push(balanceUpdate(parsed.accountId, newDelta));
    } else if (parsed.type === "transfer" && parsed.toAccountId) {
        const { sourceDelta, destDelta } = getTransferDeltas(
            types.get(parsed.accountId)!, types.get(parsed.toAccountId)!, newAmount, newFee
        );
        writes.push(balanceUpdate(parsed.accountId, sourceDelta));
        writes.push(balanceUpdate(parsed.toAccountId, destDelta));
    }

    const [updated] = await db.batch(writes);
    return updated[0];
}

export async function deleteTransaction(userId: string, id: string) {
    const [txn] = await db
        .select()
        .from(transactions)
        .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
        .limit(1);

    if (!txn) throw new NotFoundError("Transaction not found");

    const amount = Number(txn.amount);
    const fee = Number(txn.fee);

    const deleteTxn = db
        .delete(transactions)
        .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));

    const writes: Batch = [deleteTxn];

    // Reverse the balance changes
    if (txn.type === "income" || txn.type === "expense") {
        const types = await getAccountTypes([txn.accountId]);
        const delta = getBalanceDelta(types.get(txn.accountId)!, txn.type, amount, fee);
        writes.push(balanceUpdate(txn.accountId, -delta));
    } else if (txn.type === "transfer" && txn.toAccountId) {
        const types = await getAccountTypes([txn.accountId, txn.toAccountId]);
        const { sourceDelta, destDelta } = getTransferDeltas(
            types.get(txn.accountId)!, types.get(txn.toAccountId)!, amount, fee
        );
        writes.push(balanceUpdate(txn.accountId, -sourceDelta));
        writes.push(balanceUpdate(txn.toAccountId, -destDelta));
    }

    await db.batch(writes);
}
