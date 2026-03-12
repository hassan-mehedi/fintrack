"use server";

import { db } from "@/lib/db";
import {
  transactions,
  financialAccounts,
  categories,
} from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and, sql, gte, lte, desc } from "drizzle-orm";
import { startOfMonth, endOfMonth, format } from "date-fns";

export async function getDashboardData(options?: {
  from?: string;
  to?: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const userId = session.user.id;
  const now = new Date();
  const dateFrom = options?.from || format(startOfMonth(now), "yyyy-MM-dd");
  const dateTo = options?.to || format(endOfMonth(now), "yyyy-MM-dd");

  // Get all accounts
  const accounts = await db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.userId, userId))
    .orderBy(desc(financialAccounts.isDefault));

  // Totals for the selected range
  const [rangeTotals] = await db
    .select({
      totalIncome: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount}::numeric ELSE 0 END), 0)`,
      totalExpense: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount}::numeric + ${transactions.fee}::numeric ELSE 0 END), 0)`,
      totalFees: sql<string>`COALESCE(SUM(${transactions.fee}::numeric), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.date, dateFrom),
        lte(transactions.date, dateTo)
      )
    );

  // Spending by category (expenses only)
  const spendingByCategory = await db
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      total: sql<string>`SUM(${transactions.amount}::numeric + ${transactions.fee}::numeric)`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "expense"),
        gte(transactions.date, dateFrom),
        lte(transactions.date, dateTo)
      )
    )
    .groupBy(
      transactions.categoryId,
      categories.name,
      categories.color,
      categories.icon
    )
    .orderBy(sql`SUM(${transactions.amount}::numeric + ${transactions.fee}::numeric) DESC`);

  // Monthly trend (last 6 months from the end of the range)
  const rangeEnd = new Date(dateTo);
  const sixMonthsAgo = new Date(rangeEnd);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  const trendStart = format(startOfMonth(sixMonthsAgo), "yyyy-MM-dd");

  const monthlyTrend = await db
    .select({
      month: sql<string>`TO_CHAR(${transactions.date}::date, 'YYYY-MM')`,
      income: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount}::numeric ELSE 0 END), 0)`,
      expense: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount}::numeric + ${transactions.fee}::numeric ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.date, trendStart),
        lte(transactions.date, dateTo)
      )
    )
    .groupBy(sql`TO_CHAR(${transactions.date}::date, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${transactions.date}::date, 'YYYY-MM')`);

  // Recent transactions within the range
  const recentTransactions = await db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      fee: transactions.fee,
      type: transactions.type,
      description: transactions.description,
      date: transactions.date,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      accountName: financialAccounts.name,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .innerJoin(
      financialAccounts,
      eq(transactions.accountId, financialAccounts.id)
    )
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.date, dateFrom),
        lte(transactions.date, dateTo)
      )
    )
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(10);

  const totalBalance = accounts.reduce(
    (sum, acc) => sum + Number(acc.balance),
    0
  );

  return {
    accounts,
    totalBalance,
    monthlyIncome: Number(rangeTotals?.totalIncome || 0),
    monthlyExpense: Number(rangeTotals?.totalExpense || 0),
    monthlyFees: Number(rangeTotals?.totalFees || 0),
    spendingByCategory: spendingByCategory.map((s) => ({
      ...s,
      total: Number(s.total),
    })),
    monthlyTrend: monthlyTrend.map((t) => ({
      month: t.month,
      income: Number(t.income),
      expense: Number(t.expense),
    })),
    recentTransactions: recentTransactions.map((t) => ({
      ...t,
      amount: Number(t.amount),
      fee: Number(t.fee),
    })),
  };
}
