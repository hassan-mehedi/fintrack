"use server";

import { db } from "@/lib/db";
import {
  recurringTransactions,
  financialAccounts,
  categories,
} from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import { eq, and, desc } from "drizzle-orm";
import { recurringTransactionSchema } from "@/lib/validators";
import { revalidatePath } from "next/cache";
import { processRecurringForUser } from "@/lib/recurring-processor";

export async function getRecurringTransactions() {
  const session = await getSession();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const data = await db
    .select({
      id: recurringTransactions.id,
      userId: recurringTransactions.userId,
      accountId: recurringTransactions.accountId,
      categoryId: recurringTransactions.categoryId,
      amount: recurringTransactions.amount,
      fee: recurringTransactions.fee,
      type: recurringTransactions.type,
      description: recurringTransactions.description,
      frequency: recurringTransactions.frequency,
      startDate: recurringTransactions.startDate,
      endDate: recurringTransactions.endDate,
      isActive: recurringTransactions.isActive,
      lastProcessed: recurringTransactions.lastProcessed,
      createdAt: recurringTransactions.createdAt,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      accountName: financialAccounts.name,
    })
    .from(recurringTransactions)
    .innerJoin(categories, eq(recurringTransactions.categoryId, categories.id))
    .innerJoin(
      financialAccounts,
      eq(recurringTransactions.accountId, financialAccounts.id)
    )
    .where(eq(recurringTransactions.userId, session.user.id))
    .orderBy(desc(recurringTransactions.createdAt));

  return data.map((r) => ({
    ...r,
    amount: Number(r.amount),
    fee: Number(r.fee),
  }));
}

export async function createRecurringTransaction(data: unknown) {
  const session = await getSession();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = recurringTransactionSchema.parse(data);

  const [result] = await db
    .insert(recurringTransactions)
    .values({
      userId: session.user.id,
      accountId: parsed.accountId,
      categoryId: parsed.categoryId,
      amount: parsed.amount,
      fee: parsed.fee || "0",
      type: parsed.type,
      description: parsed.description,
      frequency: parsed.frequency,
      startDate: parsed.startDate,
      endDate: parsed.endDate || null,
    })
    .returning();

  revalidatePath("/recurring");
  return result;
}

export async function updateRecurringTransaction(id: string, data: unknown) {
  const session = await getSession();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = recurringTransactionSchema.parse(data);

  await db
    .update(recurringTransactions)
    .set({
      accountId: parsed.accountId,
      categoryId: parsed.categoryId,
      amount: parsed.amount,
      fee: parsed.fee || "0",
      type: parsed.type,
      description: parsed.description,
      frequency: parsed.frequency,
      startDate: parsed.startDate,
      endDate: parsed.endDate || null,
    })
    .where(
      and(
        eq(recurringTransactions.id, id),
        eq(recurringTransactions.userId, session.user.id)
      )
    );

  revalidatePath("/recurring");
}

export async function deleteRecurringTransaction(id: string) {
  const session = await getSession();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db
    .delete(recurringTransactions)
    .where(
      and(
        eq(recurringTransactions.id, id),
        eq(recurringTransactions.userId, session.user.id)
      )
    );

  revalidatePath("/recurring");
}

export async function toggleRecurringTransaction(id: string, isActive: boolean) {
  const session = await getSession();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db
    .update(recurringTransactions)
    .set({ isActive })
    .where(
      and(
        eq(recurringTransactions.id, id),
        eq(recurringTransactions.userId, session.user.id)
      )
    );

  revalidatePath("/recurring");
}

export async function processRecurringTransactions() {
  const session = await getSession();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const result = await processRecurringForUser(session.user.id);

  if (result.created > 0) {
    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    revalidatePath("/recurring");
  }

  return result;
}
