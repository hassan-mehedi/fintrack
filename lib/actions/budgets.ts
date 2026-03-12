"use server";

import { db } from "@/lib/db";
import { budgets, transactions, categories } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { budgetSchema } from "@/lib/validators";
import { revalidatePath } from "next/cache";
import { startOfMonth, endOfMonth, format } from "date-fns";

export async function getBudgets(month: number, year: number) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const dateStart = format(
    startOfMonth(new Date(year, month - 1)),
    "yyyy-MM-dd"
  );
  const dateEnd = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");

  // Get budgets with categories and spent amounts
  const budgetData = await db
    .select({
      id: budgets.id,
      amount: budgets.amount,
      month: budgets.month,
      year: budgets.year,
      categoryId: budgets.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
    })
    .from(budgets)
    .innerJoin(categories, eq(budgets.categoryId, categories.id))
    .where(
      and(
        eq(budgets.userId, session.user.id),
        eq(budgets.month, month),
        eq(budgets.year, year)
      )
    );

  // Get spending per category for the month
  const spending = await db
    .select({
      categoryId: transactions.categoryId,
      spent: sql<string>`SUM(${transactions.amount}::numeric + ${transactions.fee}::numeric)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, session.user.id),
        eq(transactions.type, "expense"),
        gte(transactions.date, dateStart),
        lte(transactions.date, dateEnd)
      )
    )
    .groupBy(transactions.categoryId);

  const spendingMap = new Map(
    spending.map((s) => [s.categoryId, Number(s.spent)])
  );

  return budgetData.map((b) => ({
    ...b,
    budgetAmount: Number(b.amount),
    spent: spendingMap.get(b.categoryId) || 0,
  }));
}

export async function createBudget(data: unknown) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = budgetSchema.parse(data);

  // Check if budget already exists for this category/month/year
  const existing = await db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.userId, session.user.id),
        eq(budgets.categoryId, parsed.categoryId),
        eq(budgets.month, parsed.month),
        eq(budgets.year, parsed.year)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Update existing
    const [budget] = await db
      .update(budgets)
      .set({ amount: parsed.amount })
      .where(eq(budgets.id, existing[0].id))
      .returning();

    revalidatePath("/budgets");
    return budget;
  }

  const [budget] = await db
    .insert(budgets)
    .values({
      userId: session.user.id,
      categoryId: parsed.categoryId,
      amount: parsed.amount,
      month: parsed.month,
      year: parsed.year,
    })
    .returning();

  revalidatePath("/budgets");
  return budget;
}

export async function deleteBudget(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db
    .delete(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.userId, session.user.id)));

  revalidatePath("/budgets");
}
