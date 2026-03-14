"use server";

import { db } from "@/lib/db";
import {
  transactions,
  financialAccounts,
  categories,
} from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and, desc, gte, lte, sql, ilike, or } from "drizzle-orm";
import { transactionSchema } from "@/lib/validators";
import { revalidatePath } from "next/cache";
import { neon } from "@neondatabase/serverless";
import { getBalanceDelta, getTransferDeltas } from "@/lib/accounts";

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
  const session = await auth();
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

async function getAccountType(accountId: string): Promise<string> {
  const [account] = await db
    .select({ type: financialAccounts.type })
    .from(financialAccounts)
    .where(eq(financialAccounts.id, accountId))
    .limit(1);
  return account.type;
}

export async function createTransaction(data: unknown) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = transactionSchema.parse(data);
  const amount = Number(parsed.amount);
  const fee = Number(parsed.fee || 0);

  const sqlClient = neon(process.env.DATABASE_URL!);
  await sqlClient`BEGIN`;

  try {
    const [txn] = await db
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

    const sourceType = await getAccountType(parsed.accountId);

    if (parsed.type === "income" || parsed.type === "expense") {
      const delta = getBalanceDelta(sourceType, parsed.type, amount, fee);
      await db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric + ${delta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, parsed.accountId));
    } else if (parsed.type === "transfer" && parsed.toAccountId) {
      const destType = await getAccountType(parsed.toAccountId);
      const { sourceDelta, destDelta } = getTransferDeltas(
        sourceType, destType, amount, fee
      );

      await db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric + ${sourceDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, parsed.accountId));
      await db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric + ${destDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, parsed.toAccountId));
    }

    await sqlClient`COMMIT`;

    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    return txn;
  } catch (error) {
    await sqlClient`ROLLBACK`;
    throw error;
  }
}

export async function updateTransaction(id: string, data: unknown) {
  const session = await auth();
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

  const sqlClient = neon(process.env.DATABASE_URL!);
  await sqlClient`BEGIN`;

  try {
    // 1. Reverse old balance effects
    const oldSourceType = await getAccountType(oldTxn.accountId);

    if (oldTxn.type === "income" || oldTxn.type === "expense") {
      const oldDelta = getBalanceDelta(oldSourceType, oldTxn.type, oldAmount, oldFee);
      await db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric - ${oldDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, oldTxn.accountId));
    } else if (oldTxn.type === "transfer" && oldTxn.toAccountId) {
      const oldDestType = await getAccountType(oldTxn.toAccountId);
      const { sourceDelta, destDelta } = getTransferDeltas(
        oldSourceType, oldDestType, oldAmount, oldFee
      );
      await db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric - ${sourceDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, oldTxn.accountId));
      await db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric - ${destDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, oldTxn.toAccountId));
    }

    // 2. Update the transaction record
    const [updated] = await db
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

    // 3. Apply new balance effects
    const newSourceType = await getAccountType(parsed.accountId);

    if (parsed.type === "income" || parsed.type === "expense") {
      const newDelta = getBalanceDelta(newSourceType, parsed.type, newAmount, newFee);
      await db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric + ${newDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, parsed.accountId));
    } else if (parsed.type === "transfer" && parsed.toAccountId) {
      const newDestType = await getAccountType(parsed.toAccountId);
      const { sourceDelta, destDelta } = getTransferDeltas(
        newSourceType, newDestType, newAmount, newFee
      );
      await db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric + ${sourceDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, parsed.accountId));
      await db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric + ${destDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, parsed.toAccountId));
    }

    await sqlClient`COMMIT`;

    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    return updated;
  } catch (error) {
    await sqlClient`ROLLBACK`;
    throw error;
  }
}

export async function deleteTransaction(id: string) {
  const session = await auth();
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
  const sourceType = await getAccountType(txn.accountId);

  // Reverse the balance changes
  if (txn.type === "income" || txn.type === "expense") {
    const delta = getBalanceDelta(sourceType, txn.type, amount, fee);
    await db
      .update(financialAccounts)
      .set({
        balance: sql`${financialAccounts.balance}::numeric - ${delta}`,
        updatedAt: new Date(),
      })
      .where(eq(financialAccounts.id, txn.accountId));
  } else if (txn.type === "transfer" && txn.toAccountId) {
    const destType = await getAccountType(txn.toAccountId);
    const { sourceDelta, destDelta } = getTransferDeltas(
      sourceType, destType, amount, fee
    );
    await db
      .update(financialAccounts)
      .set({
        balance: sql`${financialAccounts.balance}::numeric - ${sourceDelta}`,
        updatedAt: new Date(),
      })
      .where(eq(financialAccounts.id, txn.accountId));
    await db
      .update(financialAccounts)
      .set({
        balance: sql`${financialAccounts.balance}::numeric - ${destDelta}`,
        updatedAt: new Date(),
      })
      .where(eq(financialAccounts.id, txn.toAccountId));
  }

  await db
    .delete(transactions)
    .where(
      and(eq(transactions.id, id), eq(transactions.userId, session.user.id))
    );

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
}
