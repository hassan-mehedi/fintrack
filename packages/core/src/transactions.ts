import { db } from "@fintrack/db";
import {
    categories,
    financialAccounts,
    transactions,
    users,
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

interface AccountMeta {
    type: string;
    currency: string | null;
    secondaryCurrency: string | null;
}

async function getAccountMeta(ids: string[]): Promise<Map<string, AccountMeta>> {
    const rows = await db
        .select({
            id: financialAccounts.id,
            type: financialAccounts.type,
            currency: financialAccounts.currency,
            secondaryCurrency: financialAccounts.secondaryCurrency,
        })
        .from(financialAccounts)
        .where(inArray(financialAccounts.id, ids));
    return new Map(rows.map((r) => [r.id, r]));
}

async function getBaseCurrency(userId: string): Promise<string> {
    const [row] = await db
        .select({ currency: users.currency })
        .from(users)
        .where(eq(users.id, userId));
    return row?.currency ?? "BDT";
}

type Side = "primary" | "secondary";

/**
 * Resolves which currency side of the account a transaction touches.
 * `currency` is what gets stored: null for the primary side, the code for
 * the secondary side. `effective` is the actual currency of the money moved.
 */
function resolveSide(
    meta: AccountMeta,
    requested: string | null | undefined,
    baseCurrency: string
): { side: Side; currency: string | null; effective: string } {
    const primary = meta.currency || baseCurrency;
    if (!requested || requested === primary) {
        return { side: "primary", currency: null, effective: primary };
    }
    if (requested === meta.secondaryCurrency) {
        return { side: "secondary", currency: requested, effective: requested };
    }
    throw new ValidationError(`This account has no ${requested} side`);
}

// Which side a STORED transaction touched (stored currency is null for
// the primary side by construction)
function storedSide(meta: AccountMeta, storedCurrency: string | null): Side {
    return storedCurrency && storedCurrency === meta.secondaryCurrency
        ? "secondary"
        : "primary";
}

function balanceUpdate(accountId: string, delta: number, side: Side = "primary") {
    return db
        .update(financialAccounts)
        .set({
            ...(side === "primary"
                ? { balance: sql`${financialAccounts.balance}::numeric + ${delta}` }
                : {
                      secondaryBalance: sql`${financialAccounts.secondaryBalance}::numeric + ${delta}`,
                  }),
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
                currency: transactions.currency,
                toCurrency: transactions.toCurrency,
                amountReceived: transactions.amountReceived,
                accountCurrency: financialAccounts.currency,
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

interface ResolvedSides {
    src: ReturnType<typeof resolveSide>;
    dest: ReturnType<typeof resolveSide> | null;
    amountReceived: number | null;
}

// Works out the currency side of both accounts and, for cross-currency
// transfers, validates that an amount-received was supplied
async function resolveTransactionSides(
    userId: string,
    parsed: {
        accountId: string;
        toAccountId?: string | null;
        type: string;
        currency?: string | null;
        toCurrency?: string | null;
        amountReceived?: string | null;
    },
    metas: Map<string, AccountMeta>
): Promise<ResolvedSides> {
    const srcMeta = metas.get(parsed.accountId);
    if (!srcMeta) throw new NotFoundError("Account not found");

    const base =
        parsed.currency || parsed.toCurrency || srcMeta.currency
            ? await getBaseCurrency(userId)
            : "";
    const src = resolveSide(srcMeta, parsed.currency, base);

    if (parsed.type !== "transfer" || !parsed.toAccountId) {
        return { src, dest: null, amountReceived: null };
    }

    const destMeta = metas.get(parsed.toAccountId);
    if (!destMeta) throw new NotFoundError("Destination account not found");
    const destBase =
        base || (destMeta.currency ? await getBaseCurrency(userId) : "");
    const dest = resolveSide(destMeta, parsed.toCurrency, destBase);

    if (dest.effective === src.effective) {
        return { src, dest, amountReceived: null };
    }

    const amountReceived = Number(parsed.amountReceived || 0);
    if (!amountReceived || amountReceived <= 0) {
        throw new ValidationError(
            `This transfer converts ${src.effective} to ${dest.effective} — enter the amount received in ${dest.effective}`
        );
    }
    return { src, dest, amountReceived };
}

export async function createTransaction(userId: string, data: unknown) {
    const parsed = transactionSchema.parse(data);
    const amount = Number(parsed.amount);
    const fee = Number(parsed.fee || 0);

    const ids = [parsed.accountId];
    if (parsed.toAccountId) ids.push(parsed.toAccountId);
    const metas = await getAccountMeta(ids);
    const { src, dest, amountReceived } = await resolveTransactionSides(
        userId,
        parsed,
        metas
    );

    const insertTxn = db
        .insert(transactions)
        .values({
            userId,
            accountId: parsed.accountId,
            toAccountId: parsed.toAccountId || null,
            categoryId: parsed.categoryId,
            amount: parsed.amount,
            fee: parsed.fee || "0",
            currency: src.currency,
            toCurrency: dest?.currency ?? null,
            amountReceived: amountReceived !== null ? String(amountReceived) : null,
            type: parsed.type,
            description: parsed.description || "",
            date: parsed.date,
            tags: parsed.tags || [],
        })
        .returning();

    const writes: Batch = [insertTxn];

    if (parsed.type === "income" || parsed.type === "expense") {
        const delta = getBalanceDelta(
            metas.get(parsed.accountId)!.type, parsed.type, amount, fee
        );
        writes.push(balanceUpdate(parsed.accountId, delta, src.side));
    } else if (parsed.type === "transfer" && parsed.toAccountId && dest) {
        const { sourceDelta, destDelta } = getTransferDeltas(
            metas.get(parsed.accountId)!.type,
            metas.get(parsed.toAccountId)!.type,
            amount,
            fee,
            amountReceived ?? amount
        );
        writes.push(balanceUpdate(parsed.accountId, sourceDelta, src.side));
        writes.push(balanceUpdate(parsed.toAccountId, destDelta, dest.side));
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

    const ids = [oldTxn.accountId, parsed.accountId];
    if (oldTxn.toAccountId) ids.push(oldTxn.toAccountId);
    if (parsed.toAccountId) ids.push(parsed.toAccountId);
    const metas = await getAccountMeta(ids);
    const { src, dest, amountReceived } = await resolveTransactionSides(
        userId,
        parsed,
        metas
    );

    const updateTxn = db
        .update(transactions)
        .set({
            accountId: parsed.accountId,
            toAccountId: parsed.toAccountId || null,
            categoryId: parsed.categoryId,
            amount: parsed.amount,
            fee: parsed.fee || "0",
            currency: src.currency,
            toCurrency: dest?.currency ?? null,
            amountReceived: amountReceived !== null ? String(amountReceived) : null,
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
        const oldMeta = metas.get(oldTxn.accountId)!;
        const oldDelta = getBalanceDelta(oldMeta.type, oldTxn.type, oldAmount, oldFee);
        writes.push(
            balanceUpdate(oldTxn.accountId, -oldDelta, storedSide(oldMeta, oldTxn.currency))
        );
    } else if (oldTxn.type === "transfer" && oldTxn.toAccountId) {
        const oldSrcMeta = metas.get(oldTxn.accountId)!;
        const oldDestMeta = metas.get(oldTxn.toAccountId)!;
        const { sourceDelta, destDelta } = getTransferDeltas(
            oldSrcMeta.type,
            oldDestMeta.type,
            oldAmount,
            oldFee,
            oldTxn.amountReceived ? Number(oldTxn.amountReceived) : oldAmount
        );
        writes.push(
            balanceUpdate(oldTxn.accountId, -sourceDelta, storedSide(oldSrcMeta, oldTxn.currency))
        );
        writes.push(
            balanceUpdate(oldTxn.toAccountId, -destDelta, storedSide(oldDestMeta, oldTxn.toCurrency))
        );
    }

    // Apply new balance effects
    if (parsed.type === "income" || parsed.type === "expense") {
        const newDelta = getBalanceDelta(
            metas.get(parsed.accountId)!.type, parsed.type, newAmount, newFee
        );
        writes.push(balanceUpdate(parsed.accountId, newDelta, src.side));
    } else if (parsed.type === "transfer" && parsed.toAccountId && dest) {
        const { sourceDelta, destDelta } = getTransferDeltas(
            metas.get(parsed.accountId)!.type,
            metas.get(parsed.toAccountId)!.type,
            newAmount,
            newFee,
            amountReceived ?? newAmount
        );
        writes.push(balanceUpdate(parsed.accountId, sourceDelta, src.side));
        writes.push(balanceUpdate(parsed.toAccountId, destDelta, dest.side));
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
        const metas = await getAccountMeta([txn.accountId]);
        const meta = metas.get(txn.accountId)!;
        const delta = getBalanceDelta(meta.type, txn.type, amount, fee);
        writes.push(balanceUpdate(txn.accountId, -delta, storedSide(meta, txn.currency)));
    } else if (txn.type === "transfer" && txn.toAccountId) {
        const metas = await getAccountMeta([txn.accountId, txn.toAccountId]);
        const srcMeta = metas.get(txn.accountId)!;
        const destMeta = metas.get(txn.toAccountId)!;
        const { sourceDelta, destDelta } = getTransferDeltas(
            srcMeta.type,
            destMeta.type,
            amount,
            fee,
            txn.amountReceived ? Number(txn.amountReceived) : amount
        );
        writes.push(
            balanceUpdate(txn.accountId, -sourceDelta, storedSide(srcMeta, txn.currency))
        );
        writes.push(
            balanceUpdate(txn.toAccountId, -destDelta, storedSide(destMeta, txn.toCurrency))
        );
    }

    await db.batch(writes);
}
