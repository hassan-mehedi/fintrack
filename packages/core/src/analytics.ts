import { db } from "@fintrack/db";
import {
    budgets,
    categories,
    financialAccounts,
    transactionSplits,
    transactions,
} from "@fintrack/db/schema";
import { SAVINGS_ACCOUNT_TYPES } from "@fintrack/shared/types";
import {
    and,
    desc,
    eq,
    exists,
    gte,
    inArray,
    isNull,
    lte,
    not,
    sql,
    type SQL,
} from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";

const savingsTypes = [...SAVINGS_ACCOUNT_TYPES];

const monthExpr = sql<string>`TO_CHAR(${transactions.date}::date, 'YYYY-MM')`;
const spendExpr = sql<string>`SUM(${transactions.amount}::numeric + ${transactions.fee}::numeric)`;

function monthKey(date: Date) {
    return format(date, "yyyy-MM");
}

function lastMonthKeys(count: number, end: Date) {
    const keys: string[] = [];
    for (let i = count - 1; i >= 0; i--) {
        keys.push(monthKey(subMonths(end, i)));
    }
    return keys;
}

// Secondary-side (foreign currency) transactions are stamped with a
// currency and can't be summed with base-currency flows, so every
// aggregate here sticks to primary-side rows
function expenseInRange(userId: string, from: string, to: string) {
    return and(
        eq(transactions.userId, userId),
        eq(transactions.type, "expense"),
        isNull(transactions.currency),
        gte(transactions.date, from),
        lte(transactions.date, to)
    );
}

// Expense amounts attributed to a category, one row per (transaction, part).
// A transaction without splits contributes amount + fee to its own category.
// A split transaction contributes each split's amount to the split's
// category, while its fee stays with the transaction's own category.
// `where` must only reference the transactions table.
export function categorySpend(where: SQL | undefined) {
    const hasSplits = exists(
        db
            .select({ one: sql`1` })
            .from(transactionSplits)
            .where(eq(transactionSplits.transactionId, transactions.id))
    );

    const unsplit = db
        .select({
            userId: transactions.userId,
            categoryId: transactions.categoryId,
            date: transactions.date,
            amount: sql<string>`${transactions.amount}::numeric + ${transactions.fee}::numeric`.as("amount"),
        })
        .from(transactions)
        .where(and(where, not(hasSplits)));

    const splitParts = db
        .select({
            userId: transactions.userId,
            categoryId: transactionSplits.categoryId,
            date: transactions.date,
            amount: sql<string>`${transactionSplits.amount}::numeric`.as("amount"),
        })
        .from(transactionSplits)
        .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
        .where(where);

    const splitFees = db
        .select({
            userId: transactions.userId,
            categoryId: transactions.categoryId,
            date: transactions.date,
            amount: sql<string>`${transactions.fee}::numeric`.as("amount"),
        })
        .from(transactions)
        .where(and(where, hasSplits));

    return unionAll(unsplit, splitParts, splitFees).as("spend");
}

function totalsQuery(userId: string, from: string, to: string) {
    return db
        .select({
            income: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount}::numeric ELSE 0 END), 0)`,
            expense: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount}::numeric + ${transactions.fee}::numeric ELSE 0 END), 0)`,
            fees: sql<string>`COALESCE(SUM(${transactions.fee}::numeric), 0)`,
        })
        .from(transactions)
        .where(
            and(
                eq(transactions.userId, userId),
                isNull(transactions.currency),
                gte(transactions.date, from),
                lte(transactions.date, to)
            )
        );
}

function toTotals(rows: Awaited<ReturnType<typeof totalsQuery>>) {
    return {
        income: Number(rows[0]?.income || 0),
        expense: Number(rows[0]?.expense || 0),
        fees: Number(rows[0]?.fees || 0),
    };
}

function dailySpendQuery(userId: string, from: string, to: string) {
    return db
        .select({ date: transactions.date, total: spendExpr })
        .from(transactions)
        .where(expenseInRange(userId, from, to))
        .groupBy(transactions.date)
        .orderBy(transactions.date);
}

function categoryTotalsQuery(userId: string, from: string, to: string) {
    const spend = categorySpend(expenseInRange(userId, from, to));
    return db
        .select({
            categoryId: spend.categoryId,
            categoryName: categories.name,
            categoryIcon: categories.icon,
            total: sql<string>`SUM(${spend.amount})`,
        })
        .from(spend)
        .innerJoin(categories, eq(spend.categoryId, categories.id))
        .groupBy(spend.categoryId, categories.name, categories.icon);
}

function anomalyQueries(userId: string, from: string, to: string) {
    const historyFrom = format(
        startOfMonth(subMonths(new Date(from), 6)),
        "yyyy-MM-dd"
    );
    const historyTo = format(
        endOfMonth(subMonths(new Date(from), 1)),
        "yyyy-MM-dd"
    );

    const averages = db
        .select({
            categoryId: transactions.categoryId,
            average: sql<string>`AVG(${transactions.amount}::numeric)`,
            count: sql<string>`COUNT(*)`,
        })
        .from(transactions)
        .where(expenseInRange(userId, historyFrom, historyTo))
        .groupBy(transactions.categoryId);

    const rangeExpenses = db
        .select({
            id: transactions.id,
            description: transactions.description,
            amount: transactions.amount,
            date: transactions.date,
            categoryId: transactions.categoryId,
            categoryName: categories.name,
            categoryIcon: categories.icon,
        })
        .from(transactions)
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(expenseInRange(userId, from, to));

    return [averages, rangeExpenses] as const;
}

function buildAnomalies(
    averages: { categoryId: string; average: string; count: string }[],
    rangeExpenses: {
        id: string;
        description: string;
        amount: string;
        date: string;
        categoryId: string;
        categoryName: string;
        categoryIcon: string;
    }[]
) {
    const averageByCategory = new Map(
        averages
            .filter((row) => Number(row.count) >= 5)
            .map((row) => [row.categoryId, Number(row.average)])
    );

    return rangeExpenses
        .map((txn) => ({
            id: txn.id,
            description: txn.description,
            date: txn.date,
            categoryName: txn.categoryName,
            categoryIcon: txn.categoryIcon,
            amount: Number(txn.amount),
            categoryAverage:
                Math.round((averageByCategory.get(txn.categoryId) ?? 0) * 100) /
                100,
        }))
        .filter(
            (txn) =>
                txn.categoryAverage > 0 && txn.amount > txn.categoryAverage * 3
        )
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
}

export type SpendingAnomaly = ReturnType<typeof buildAnomalies>[number];

// Expenses far above the category's average over the preceding six months.
// Categories need at least 5 prior transactions before they can flag one.
export async function getSpendingAnomalies(
    userId: string,
    options?: { from?: string; to?: string }
): Promise<SpendingAnomaly[]> {
    const now = new Date();
    const from = options?.from || format(startOfMonth(now), "yyyy-MM-dd");
    const to = options?.to || format(endOfMonth(now), "yyyy-MM-dd");

    const [averages, rangeExpenses] = await db.batch(anomalyQueries(userId, from, to));
    return buildAnomalies(averages, rangeExpenses);
}

function savingsInflowsQuery(userId: string, from: string) {
    return db
        .select({
            month: monthExpr,
            total: sql<string>`SUM(${transactions.amount}::numeric)`,
        })
        .from(transactions)
        .innerJoin(
            financialAccounts,
            eq(transactions.toAccountId, financialAccounts.id)
        )
        .where(
            and(
                eq(transactions.userId, userId),
                eq(transactions.type, "transfer"),
                isNull(transactions.currency),
                inArray(financialAccounts.type, savingsTypes),
                gte(transactions.date, from)
            )
        )
        .groupBy(monthExpr);
}

function savingsOutflowsQuery(userId: string, from: string) {
    return db
        .select({
            month: monthExpr,
            incoming: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount}::numeric ELSE 0 END), 0)`,
            outgoing: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('transfer', 'expense') THEN ${transactions.amount}::numeric + ${transactions.fee}::numeric ELSE 0 END), 0)`,
        })
        .from(transactions)
        .innerJoin(
            financialAccounts,
            eq(transactions.accountId, financialAccounts.id)
        )
        .where(
            and(
                eq(transactions.userId, userId),
                isNull(transactions.currency),
                inArray(financialAccounts.type, savingsTypes),
                gte(transactions.date, from)
            )
        )
        .groupBy(monthExpr);
}

// Net money moved into FDR/DPS accounts per month: transfers in and interest
// income minus transfers/spending out of them.
function netSavingsByMonth(
    inflows: { month: string; total: string }[],
    outflows: { month: string; incoming: string; outgoing: string }[]
) {
    const net = new Map<string, number>();
    for (const row of inflows) {
        net.set(row.month, (net.get(row.month) ?? 0) + Number(row.total));
    }
    for (const row of outflows) {
        const delta = Number(row.incoming) - Number(row.outgoing);
        net.set(row.month, (net.get(row.month) ?? 0) + delta);
    }
    return net;
}

export async function getMonthAnalytics(
    userId: string,
    options?: { from?: string; to?: string; anomalies?: SpendingAnomaly[] }
) {
    const now = new Date();
    const from = options?.from || format(startOfMonth(now), "yyyy-MM-dd");
    const to = options?.to || format(endOfMonth(now), "yyyy-MM-dd");
    const rangeStart = new Date(from);

    const prevMonth = subMonths(rangeStart, 1);
    const prevFrom = format(startOfMonth(prevMonth), "yyyy-MM-dd");
    const prevTo = format(endOfMonth(prevMonth), "yyyy-MM-dd");

    const trendMonths = 6;
    const trendStart = format(
        startOfMonth(subMonths(rangeStart, trendMonths - 1)),
        "yyyy-MM-dd"
    );
    const historyStart = format(
        startOfMonth(subMonths(rangeStart, 11)),
        "yyyy-MM-dd"
    );

    const trendSpend = categorySpend(expenseInRange(userId, trendStart, to));
    const trendMonthExpr = sql<string>`TO_CHAR(${trendSpend.date}::date, 'YYYY-MM')`;

    // Every read is independent, so they travel in one round trip
    const [
        [
            dailySpend,
            prevDailySpend,
            budgetRows,
            weekdayRows,
            topMerchants,
            totalsRows,
            prevTotalsRows,
            biggestRows,
            categoryTotals,
            prevCategoryTotals,
            trendRows,
            budgetHistoryRows,
            monthlySpendRows,
            savingsAccounts,
            savingsInflows,
            savingsOutflows,
        ],
        anomalies,
    ] = await Promise.all([
        db.batch([
            dailySpendQuery(userId, from, to),
            dailySpendQuery(userId, prevFrom, prevTo),

            db
                .select({ total: sql<string>`COALESCE(SUM(${budgets.amount}::numeric), 0)` })
                .from(budgets)
                .where(
                    and(
                        eq(budgets.userId, userId),
                        eq(budgets.month, rangeStart.getMonth() + 1),
                        eq(budgets.year, rangeStart.getFullYear())
                    )
                ),

            db
                .select({
                    dow: sql<string>`EXTRACT(DOW FROM ${transactions.date}::date)`,
                    total: spendExpr,
                })
                .from(transactions)
                .where(expenseInRange(userId, from, to))
                .groupBy(sql`EXTRACT(DOW FROM ${transactions.date}::date)`),

            db
                .select({
                    description: sql<string>`MIN(${transactions.description})`,
                    count: sql<string>`COUNT(*)`,
                    total: spendExpr,
                })
                .from(transactions)
                .where(
                    and(
                        expenseInRange(userId, from, to),
                        sql`${transactions.description} <> ''`
                    )
                )
                .groupBy(sql`LOWER(TRIM(${transactions.description}))`)
                .orderBy(sql`SUM(${transactions.amount}::numeric + ${transactions.fee}::numeric) DESC`)
                .limit(8),

            totalsQuery(userId, from, to),
            totalsQuery(userId, prevFrom, prevTo),

            db
                .select({
                    id: transactions.id,
                    description: transactions.description,
                    amount: transactions.amount,
                    date: transactions.date,
                    categoryName: categories.name,
                    categoryIcon: categories.icon,
                })
                .from(transactions)
                .innerJoin(categories, eq(transactions.categoryId, categories.id))
                .where(expenseInRange(userId, from, to))
                .orderBy(desc(sql`${transactions.amount}::numeric`))
                .limit(1),

            categoryTotalsQuery(userId, from, to),
            categoryTotalsQuery(userId, prevFrom, prevTo),

            db
                .select({
                    categoryId: trendSpend.categoryId,
                    categoryName: categories.name,
                    categoryIcon: categories.icon,
                    categoryColor: categories.color,
                    month: trendMonthExpr,
                    total: sql<string>`SUM(${trendSpend.amount})`,
                })
                .from(trendSpend)
                .innerJoin(categories, eq(trendSpend.categoryId, categories.id))
                .groupBy(
                    trendSpend.categoryId,
                    categories.name,
                    categories.icon,
                    categories.color,
                    trendMonthExpr
                ),

            db
                .select({
                    month: budgets.month,
                    year: budgets.year,
                    total: sql<string>`SUM(${budgets.amount}::numeric)`,
                })
                .from(budgets)
                .where(eq(budgets.userId, userId))
                .groupBy(budgets.month, budgets.year),

            db
                .select({ month: monthExpr, total: spendExpr })
                .from(transactions)
                .where(expenseInRange(userId, trendStart, to))
                .groupBy(monthExpr),

            db
                .select({ balance: financialAccounts.balance })
                .from(financialAccounts)
                .where(
                    and(
                        eq(financialAccounts.userId, userId),
                        inArray(financialAccounts.type, savingsTypes)
                    )
                ),

            savingsInflowsQuery(userId, historyStart),
            savingsOutflowsQuery(userId, historyStart),
        ]),

        options?.anomalies ?? getSpendingAnomalies(userId, { from, to }),
    ]);

    const totals = toTotals(totalsRows);
    const prevTotals = toTotals(prevTotalsRows);
    const savingsNet = netSavingsByMonth(savingsInflows, savingsOutflows);

    const monthKeys = lastMonthKeys(trendMonths, rangeStart);

    // Category sparklines: top 6 categories by 6-month spend
    const trendByCategory = new Map<
        string,
        {
            categoryId: string;
            categoryName: string;
            categoryIcon: string;
            categoryColor: string;
            byMonth: Map<string, number>;
            total: number;
        }
    >();
    for (const row of trendRows) {
        let entry = trendByCategory.get(row.categoryId);
        if (!entry) {
            entry = {
                categoryId: row.categoryId,
                categoryName: row.categoryName,
                categoryIcon: row.categoryIcon,
                categoryColor: row.categoryColor,
                byMonth: new Map(),
                total: 0,
            };
            trendByCategory.set(row.categoryId, entry);
        }
        entry.byMonth.set(row.month, Number(row.total));
        entry.total += Number(row.total);
    }
    const categoryTrends = [...trendByCategory.values()]
        .sort((a, b) => b.total - a.total)
        .slice(0, 6)
        .map((entry) => ({
            categoryId: entry.categoryId,
            categoryName: entry.categoryName,
            categoryIcon: entry.categoryIcon,
            categoryColor: entry.categoryColor,
            months: monthKeys.map((key) => ({
                month: key,
                total: entry.byMonth.get(key) ?? 0,
            })),
        }));

    // Budget vs actual for the last 6 months
    const budgetsByMonth = new Map(
        budgetHistoryRows.map((row) => [
            `${row.year}-${String(row.month).padStart(2, "0")}`,
            Number(row.total),
        ])
    );
    const spendByMonth = new Map(
        monthlySpendRows.map((row) => [row.month, Number(row.total)])
    );
    const budgetHistory = monthKeys.map((key) => ({
        month: key,
        budgeted: budgetsByMonth.get(key) ?? 0,
        spent: spendByMonth.get(key) ?? 0,
    }));

    // Top category increases vs the previous month
    const prevByCategory = new Map(
        prevCategoryTotals.map((row) => [row.categoryId, Number(row.total)])
    );
    const topIncreases = categoryTotals
        .map((row) => ({
            categoryName: row.categoryName,
            categoryIcon: row.categoryIcon,
            total: Number(row.total),
            previousTotal: prevByCategory.get(row.categoryId) ?? 0,
        }))
        .map((row) => ({ ...row, delta: row.total - row.previousTotal }))
        .filter((row) => row.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 3);

    // Savings balance walked back from today using monthly net flows
    const currentSavings = savingsAccounts.reduce(
        (sum, row) => sum + Number(row.balance),
        0
    );
    const savingsKeys = lastMonthKeys(12, now);
    const balances: number[] = new Array(savingsKeys.length);
    let running = currentSavings;
    for (let i = savingsKeys.length - 1; i >= 0; i--) {
        balances[i] = running;
        running -= savingsNet.get(savingsKeys[i]) ?? 0;
    }
    const savingsGrowth = savingsKeys.map((key, i) => ({
        month: key,
        balance: Math.round(balances[i] * 100) / 100,
    }));

    // Projection from the average contribution of the last 3 full months
    const fullMonthKeys = savingsKeys.slice(-4, -1);
    const recentFlows = fullMonthKeys.map((key) => savingsNet.get(key) ?? 0);
    const monthlyAverage =
        recentFlows.length > 0
            ? recentFlows.reduce((sum, val) => sum + val, 0) / recentFlows.length
            : 0;
    const projected = Array.from({ length: 6 }, (_, i) => ({
        month: monthKey(subMonths(now, -(i + 1))),
        balance:
            Math.round((currentSavings + monthlyAverage * (i + 1)) * 100) / 100,
    }));

    const biggest = biggestRows[0];

    return {
        dailySpend: dailySpend.map((row) => ({
            date: row.date,
            total: Number(row.total),
        })),
        prevDailySpend: prevDailySpend.map((row) => ({
            date: row.date,
            total: Number(row.total),
        })),
        budgetTotal: Number(budgetRows[0]?.total || 0),
        weekdaySplit: weekdayRows.map((row) => ({
            dow: Number(row.dow),
            total: Number(row.total),
        })),
        topMerchants: topMerchants.map((row) => ({
            description: row.description,
            count: Number(row.count),
            total: Number(row.total),
        })),
        monthReview: {
            income: totals.income,
            expense: totals.expense,
            fees: totals.fees,
            previousIncome: prevTotals.income,
            previousExpense: prevTotals.expense,
            biggestTransaction: biggest
                ? {
                      id: biggest.id,
                      description: biggest.description,
                      amount: Number(biggest.amount),
                      date: biggest.date,
                      categoryName: biggest.categoryName,
                      categoryIcon: biggest.categoryIcon,
                  }
                : null,
            topIncreases,
        },
        anomalies,
        categoryTrends,
        budgetHistory,
        savings: {
            current: currentSavings,
            hasSavingsAccounts: savingsAccounts.length > 0,
            growth: savingsGrowth,
            monthlyAverage: Math.round(monthlyAverage * 100) / 100,
            projected,
        },
    };
}

export async function getYearOverview(userId: string, year: number) {
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;

    const [rows, savingsInflows, savingsOutflows] = await db.batch([
        db
            .select({
                month: monthExpr,
                income: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount}::numeric ELSE 0 END), 0)`,
                expense: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount}::numeric + ${transactions.fee}::numeric ELSE 0 END), 0)`,
            })
            .from(transactions)
            .where(
                and(
                    eq(transactions.userId, userId),
                    isNull(transactions.currency),
                    gte(transactions.date, from),
                    lte(transactions.date, to)
                )
            )
            .groupBy(monthExpr),

        savingsInflowsQuery(userId, from),
        savingsOutflowsQuery(userId, from),
    ]);
    const savingsNet = netSavingsByMonth(savingsInflows, savingsOutflows);

    const byMonth = new Map(rows.map((row) => [row.month, row]));
    const months = Array.from({ length: 12 }, (_, i) => {
        const key = `${year}-${String(i + 1).padStart(2, "0")}`;
        const row = byMonth.get(key);
        return {
            month: key,
            income: Number(row?.income || 0),
            expense: Number(row?.expense || 0),
            saved: savingsNet.get(key) ?? 0,
        };
    });

    const activeMonths = months.filter((m) => m.income > 0 || m.expense > 0);
    const totalIncome = months.reduce((sum, m) => sum + m.income, 0);
    const totalExpense = months.reduce((sum, m) => sum + m.expense, 0);
    const totalSaved = months.reduce((sum, m) => sum + m.saved, 0);

    return {
        year,
        months,
        totals: {
            income: totalIncome,
            expense: totalExpense,
            saved: totalSaved,
            averageMonthlyExpense:
                activeMonths.length > 0
                    ? Math.round((totalExpense / activeMonths.length) * 100) / 100
                    : 0,
        },
    };
}

export async function getSubscriptionCandidates(userId: string) {
    const start = format(subMonths(new Date(), 6), "yyyy-MM-dd");

    const rows = await db
        .select({
            description: sql<string>`MIN(${transactions.description})`,
            count: sql<string>`COUNT(*)`,
            averageAmount: sql<string>`AVG(${transactions.amount}::numeric)`,
            lastDate: sql<string>`MAX(${transactions.date})`,
            monthsSeen: sql<string>`COUNT(DISTINCT TO_CHAR(${transactions.date}::date, 'YYYY-MM'))`,
        })
        .from(transactions)
        .where(
            and(
                eq(transactions.userId, userId),
                eq(transactions.type, "expense"),
                isNull(transactions.recurringId),
                isNull(transactions.currency),
                sql`${transactions.description} <> ''`,
                gte(transactions.date, start)
            )
        )
        .groupBy(sql`LOWER(TRIM(${transactions.description}))`)
        .having(
            sql`COUNT(*) >= 3 AND COUNT(DISTINCT TO_CHAR(${transactions.date}::date, 'YYYY-MM')) >= 3 AND COALESCE(STDDEV(${transactions.amount}::numeric), 0) <= AVG(${transactions.amount}::numeric) * 0.15`
        )
        .orderBy(sql`AVG(${transactions.amount}::numeric) DESC`)
        .limit(10);

    return rows.map((row) => ({
        description: row.description,
        count: Number(row.count),
        averageAmount: Math.round(Number(row.averageAmount) * 100) / 100,
        lastDate: row.lastDate,
        monthsSeen: Number(row.monthsSeen),
    }));
}
