"use server";

import { db } from "@/lib/db";
import {
  recurringTransactions,
  transactions,
  financialAccounts,
  categories,
} from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and, desc, lte, sql } from "drizzle-orm";
import { recurringTransactionSchema } from "@/lib/validators";
import { revalidatePath } from "next/cache";
import { neon } from "@neondatabase/serverless";
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

export async function getRecurringTransactions() {
  const session = await auth();
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
  const session = await auth();
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
  const session = await auth();
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
  const session = await auth();
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
  const session = await auth();
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
  const session = await auth();
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

  const sqlClient = neon(process.env.DATABASE_URL!);
  let created = 0;

  for (const rule of active) {
    // Skip if past end date
    if (rule.endDate && todayStr > rule.endDate) continue;

    // Determine which dates need transactions
    const startFrom = rule.lastProcessed
      ? getNextDate(parseISO(rule.lastProcessed), rule.frequency)
      : parseISO(rule.startDate);

    let current = startFrom;

    while (isBefore(current, today) || isEqual(current, today)) {
      const dateStr = format(current, "yyyy-MM-dd");
      if (rule.endDate && dateStr > rule.endDate) break;

      const amount = Number(rule.amount);
      const fee = Number(rule.fee);

      await sqlClient`BEGIN`;
      try {
        // Insert transaction
        await db.insert(transactions).values({
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

        // Update account balance
        if (rule.type === "income") {
          await db
            .update(financialAccounts)
            .set({
              balance: sql`${financialAccounts.balance}::numeric + ${amount - fee}`,
              updatedAt: new Date(),
            })
            .where(eq(financialAccounts.id, rule.accountId));
        } else if (rule.type === "expense") {
          await db
            .update(financialAccounts)
            .set({
              balance: sql`${financialAccounts.balance}::numeric - ${amount + fee}`,
              updatedAt: new Date(),
            })
            .where(eq(financialAccounts.id, rule.accountId));
        }

        // Update lastProcessed
        await db
          .update(recurringTransactions)
          .set({ lastProcessed: dateStr })
          .where(eq(recurringTransactions.id, rule.id));

        await sqlClient`COMMIT`;
        created++;
      } catch (error) {
        await sqlClient`ROLLBACK`;
        throw error;
      }

      current = getNextDate(current, rule.frequency);
    }
  }

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/recurring");

  return { created };
}
