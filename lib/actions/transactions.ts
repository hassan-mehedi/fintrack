"use server";

import { db } from "@/lib/db";
import {
  transactions,
  financialAccounts,
  categories,
} from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import { eq, and, desc, gte, lte, sql, ilike, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { transactionSchema } from "@/lib/validators";
import { revalidatePath } from "next/cache";
import { getBalanceDelta, getTransferDeltas } from "@/lib/accounts";

type Batch = [BatchItem<"pg">, ...BatchItem<"pg">[]];

async function getAccountTypes(ids: string[]): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: financialAccounts.id, type: financialAccounts.type })
    .from(financialAccounts)
    .where(inArray(financialAccounts.id, ids));
  return new Map(rows.map((r) => [r.id, r.type]));
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

export async function getTransactions(filters?: {
  type?: string;
  categoryId?: string;
  accountId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const session = await getSession();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const offset = (page - 1) * limit;

  const conditions = [eq(transactions.userId, session.user.id)];

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

export async function createTransaction(data: unknown) {
  const session = await getSession();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = transactionSchema.parse(data);
  const amount = Number(parsed.amount);
  const fee = Number(parsed.fee || 0);

  const insertTxn = db
    .insert(transactions)
    .values({
      userId: session.user.id,
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
    const types = await getAccountTypes([parsed.accountId, parsed.toAccountId]);
    const { sourceDelta, destDelta } = getTransferDeltas(
      types.get(parsed.accountId)!, types.get(parsed.toAccountId)!, amount, fee
    );
    writes.push(balanceUpdate(parsed.accountId, sourceDelta));
    writes.push(balanceUpdate(parsed.toAccountId, destDelta));
  }

  const [inserted] = await db.batch(writes);

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  return inserted[0];
}

export async function updateTransaction(id: string, data: unknown) {
  const session = await getSession();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = transactionSchema.parse(data);
  const newAmount = Number(parsed.amount);
  const newFee = Number(parsed.fee || 0);

  const [oldTxn] = await db
    .select()
    .from(transactions)
    .where(
      and(eq(transactions.id, id), eq(transactions.userId, session.user.id))
    )
    .limit(1);

  if (!oldTxn) throw new Error("Transaction not found");

  const oldAmount = Number(oldTxn.amount);
  const oldFee = Number(oldTxn.fee);

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
    .where(
      and(eq(transactions.id, id), eq(transactions.userId, session.user.id))
    )
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

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  return updated[0];
}

export async function deleteTransaction(id: string) {
  const session = await getSession();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [txn] = await db
    .select()
    .from(transactions)
    .where(
      and(eq(transactions.id, id), eq(transactions.userId, session.user.id))
    )
    .limit(1);

  if (!txn) throw new Error("Transaction not found");

  const amount = Number(txn.amount);
  const fee = Number(txn.fee);

  const deleteTxn = db
    .delete(transactions)
    .where(
      and(eq(transactions.id, id), eq(transactions.userId, session.user.id))
    );

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

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
}
