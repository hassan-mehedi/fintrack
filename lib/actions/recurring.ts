"use server";

import { db } from "@/lib/db";
import {
  recurringTransactions,
  transactions,
  financialAccounts,
  categories,
} from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import { eq, and, desc, lte, sql, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { recurringTransactionSchema } from "@/lib/validators";
import { revalidatePath } from "next/cache";
import {
  addDays,
  addWeeks,
  addMonths,
  addYears,
  format,
  parseISO,
  isBefore,
  isEqual,
} from "date-fns";
import { getBalanceDelta } from "@/lib/accounts";

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

function getNextDate(
  lastDate: Date,
  frequency: "daily" | "weekly" | "monthly" | "yearly"
): Date {
  switch (frequency) {
    case "daily":
      return addDays(lastDate, 1);
    case "weekly":
      return addWeeks(lastDate, 1);
    case "monthly":
      return addMonths(lastDate, 1);
    case "yearly":
      return addYears(lastDate, 1);
  }
}

export async function processRecurringTransactions() {
  const session = await getSession();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  // Get all active recurring transactions for this user
  const active = await db
    .select()
    .from(recurringTransactions)
    .where(
      and(
        eq(recurringTransactions.userId, session.user.id),
        eq(recurringTransactions.isActive, true),
        lte(recurringTransactions.startDate, todayStr)
      )
    );

  if (active.length === 0) return { created: 0 };

  // Fetch every involved account's type once instead of per generated date
  const accountIds = [...new Set(active.map((r) => r.accountId))];
  const typeRows = await db
    .select({ id: financialAccounts.id, type: financialAccounts.type })
    .from(financialAccounts)
    .where(inArray(financialAccounts.id, accountIds));
  const accountTypes = new Map(typeRows.map((r) => [r.id, r.type]));

  const newRows: (typeof transactions.$inferInsert)[] = [];
  const balanceDeltas = new Map<string, number>();
  const lastProcessedByRule = new Map<string, string>();

  for (const rule of active) {
    if (rule.endDate && todayStr > rule.endDate) continue;

    const startFrom = rule.lastProcessed
      ? getNextDate(parseISO(rule.lastProcessed), rule.frequency)
      : parseISO(rule.startDate);

    const amount = Number(rule.amount);
    const fee = Number(rule.fee);
    const accountType = accountTypes.get(rule.accountId);
    let current = startFrom;

    while (isBefore(current, today) || isEqual(current, today)) {
      const dateStr = format(current, "yyyy-MM-dd");
      if (rule.endDate && dateStr > rule.endDate) break;

      newRows.push({
        userId: session.user.id,
        accountId: rule.accountId,
        categoryId: rule.categoryId,
        amount: rule.amount,
        fee: rule.fee,
        type: rule.type,
        description: rule.description,
        date: dateStr,
        tags: [],
        recurringId: rule.id,
      });

      if (accountType) {
        const delta = getBalanceDelta(
          accountType, rule.type as "income" | "expense", amount, fee
        );
        balanceDeltas.set(
          rule.accountId, (balanceDeltas.get(rule.accountId) ?? 0) + delta
        );
      }
      lastProcessedByRule.set(rule.id, dateStr);

      current = getNextDate(current, rule.frequency);
    }
  }

  if (newRows.length === 0) return { created: 0 };

  // One atomic batch: all inserts + net balance change per account + lastProcessed
  const writes: [BatchItem<"pg">, ...BatchItem<"pg">[]] = [
    db.insert(transactions).values(newRows),
  ];

  for (const [accountId, delta] of balanceDeltas) {
    writes.push(
      db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric + ${delta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, accountId))
    );
  }

  for (const [ruleId, dateStr] of lastProcessedByRule) {
    writes.push(
      db
        .update(recurringTransactions)
        .set({ lastProcessed: dateStr })
        .where(eq(recurringTransactions.id, ruleId))
    );
  }

  await db.batch(writes);

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/recurring");

  return { created: newRows.length };
}
