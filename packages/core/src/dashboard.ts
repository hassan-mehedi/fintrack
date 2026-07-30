import { db } from "@fintrack/db";
import {
    categories,
    financialAccounts,
    transactions,
} from "@fintrack/db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { isLiabilityAccount } from "./balance";
import { recordNetWorthSnapshot } from "./net-worth";

export async function getDashboardData(
    userId: string,
    options?: { from?: string; to?: string }
) {
    const now = new Date();
    const dateFrom = options?.from || format(startOfMonth(now), "yyyy-MM-dd");
    const dateTo = options?.to || format(endOfMonth(now), "yyyy-MM-dd");

    // Monthly trend (last 6 months from the end of the range)
    const rangeEnd = new Date(dateTo);
    const sixMonthsAgo = new Date(rangeEnd);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    const trendStart = format(startOfMonth(sixMonthsAgo), "yyyy-MM-dd");

    // Previous calendar month relative to the range start, for category deltas
    const prevMonth = subMonths(new Date(dateFrom), 1);
    const prevFrom = format(startOfMonth(prevMonth), "yyyy-MM-dd");
    const prevTo = format(endOfMonth(prevMonth), "yyyy-MM-dd");

    // These queries are independent — run them in one parallel batch
    const [
        accounts,
        rangeTotalsRows,
        spendingByCategory,
        previousSpending,
        monthlyTrend,
        recentTransactions,
    ] = await Promise.all([
            db
                .select()
                .from(financialAccounts)
                .where(eq(financialAccounts.userId, userId))
                .orderBy(desc(financialAccounts.isDefault)),

            db
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
                ),

            db
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
                .orderBy(sql`SUM(${transactions.amount}::numeric + ${transactions.fee}::numeric) DESC`),

            db
                .select({
                    categoryId: transactions.categoryId,
                    total: sql<string>`SUM(${transactions.amount}::numeric + ${transactions.fee}::numeric)`,
                })
                .from(transactions)
                .where(
                    and(
                        eq(transactions.userId, userId),
                        eq(transactions.type, "expense"),
                        gte(transactions.date, prevFrom),
                        lte(transactions.date, prevTo)
                    )
                )
                .groupBy(transactions.categoryId),

            db
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
                .orderBy(sql`TO_CHAR(${transactions.date}::date, 'YYYY-MM')`),

            db
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
                .limit(10),
        ]);

    const rangeTotals = rangeTotalsRows[0];

    const totalAssets = accounts
        .filter((acc) => !isLiabilityAccount(acc.type))
        .reduce((sum, acc) => sum + Number(acc.balance), 0);

    const totalLiabilities = accounts
        .filter((acc) => isLiabilityAccount(acc.type))
        .reduce((sum, acc) => sum + Number(acc.balance), 0);

    const netWorth = totalAssets - totalLiabilities;

    // Best-effort daily snapshot for the net worth history chart; ignore
    // failures (e.g. the snapshots migration not applied yet)
    try {
        await recordNetWorthSnapshot(userId, {
            netWorth,
            totalAssets,
            totalLiabilities,
        });
    } catch {
        // dashboard data is still valid without the snapshot
    }

    const previousTotals = new Map(
        previousSpending.map((s) => [s.categoryId, Number(s.total)])
    );

    return {
        accounts,
        totalBalance: netWorth,
        totalAssets,
        totalLiabilities,
        netWorth,
        monthlyIncome: Number(rangeTotals?.totalIncome || 0),
        monthlyExpense: Number(rangeTotals?.totalExpense || 0),
        monthlyFees: Number(rangeTotals?.totalFees || 0),
        spendingByCategory: spendingByCategory.map((s) => ({
            ...s,
            total: Number(s.total),
            previousTotal: previousTotals.get(s.categoryId) ?? 0,
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
