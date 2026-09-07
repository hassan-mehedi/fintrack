import { db } from "@fintrack/db";
import {
    categories,
    financialAccounts,
    transactions,
    users,
} from "@fintrack/db/schema";
import { and, desc, eq, gte, inArray, isNull, lte, notInArray, sql } from "drizzle-orm";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { LIQUID_ACCOUNT_TYPES, SAVINGS_ACCOUNT_TYPES } from "@fintrack/shared/types";
import { categorySpend, getSpendingAnomalies, type SpendingAnomaly } from "./analytics";
import { isLiabilityAccount } from "./balance";

// Accounts and the user's base currency: foreign-currency accounts can't be
// summed with base-currency ones, so every aggregate needs both
async function loadAccounts(userId: string) {
    const [[userRow], accounts] = await db.batch([
        db
            .select({ currency: users.currency })
            .from(users)
            .where(eq(users.id, userId)),
        db
            .select()
            .from(financialAccounts)
            .where(
                and(
                    eq(financialAccounts.userId, userId),
                    eq(financialAccounts.isArchived, false)
                )
            )
            .orderBy(desc(financialAccounts.isDefault)),
    ]);

    const baseCurrency = userRow?.currency ?? "BDT";
    const isBaseCurrency = (currency: string | null) =>
        !currency || currency === baseCurrency;

    return { accounts, baseCurrency, isBaseCurrency };
}

type Accounts = Awaited<ReturnType<typeof loadAccounts>>;

// Totals only make sense within one currency, so foreign-currency
// accounts are left out and shown individually instead
function summarizeNetWorth({ accounts, isBaseCurrency }: Accounts) {
    const baseAccounts = accounts.filter((acc) => isBaseCurrency(acc.currency));

    const totalAssets = baseAccounts
        .filter((acc) => !isLiabilityAccount(acc.type))
        .reduce((sum, acc) => sum + Number(acc.balance), 0);

    const totalLiabilities = baseAccounts
        .filter((acc) => isLiabilityAccount(acc.type))
        .reduce((sum, acc) => sum + Number(acc.balance), 0);

    return {
        baseAccounts,
        totalAssets,
        totalLiabilities,
        netWorth: totalAssets - totalLiabilities,
    };
}

export async function computeNetWorth(userId: string) {
    const { totalAssets, totalLiabilities, netWorth } = summarizeNetWorth(
        await loadAccounts(userId)
    );
    return { totalAssets, totalLiabilities, netWorth };
}

export async function getDashboardData(
    userId: string,
    options?: { from?: string; to?: string; anomalies?: SpendingAnomaly[] }
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

    const loaded = await loadAccounts(userId);
    const { accounts, baseCurrency, isBaseCurrency } = loaded;
    const foreignAccountIds = accounts
        .filter((acc) => !isBaseCurrency(acc.currency))
        .map((acc) => acc.id);
    const excludeForeign = foreignAccountIds.length
        ? notInArray(transactions.accountId, foreignAccountIds)
        : undefined;
    // Transactions stamped with a currency hit an account's secondary
    // (foreign) side, so they can't be summed with base-currency flows
    const primarySideOnly = isNull(transactions.currency);

    const savingsTypes: string[] = [...SAVINGS_ACCOUNT_TYPES];
    const baseSavingsAccountIds = accounts
        .filter((acc) => savingsTypes.includes(acc.type) && isBaseCurrency(acc.currency))
        .map((acc) => acc.id);

    // Per-category spend is split-aware: a split transaction is spread over
    // its splits' categories (see categorySpend)
    const expenseInRange = (from: string, to: string) =>
        categorySpend(
            and(
                eq(transactions.userId, userId),
                eq(transactions.type, "expense"),
                gte(transactions.date, from),
                lte(transactions.date, to),
                excludeForeign,
                primarySideOnly
            )
        );
    const rangeSpend = expenseInRange(dateFrom, dateTo);
    const previousSpend = expenseInRange(prevFrom, prevTo);

    // These queries are independent — run them in one parallel batch
    const [
        rangeTotalsRows,
        spendingByCategory,
        previousSpending,
        monthlyTrend,
        recentTransactions,
        savingsRows,
        anomalies,
    ] = await Promise.all([
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
                        lte(transactions.date, dateTo),
                        excludeForeign,
                        primarySideOnly
                    )
                ),

            db
                .select({
                    categoryId: rangeSpend.categoryId,
                    categoryName: categories.name,
                    categoryColor: categories.color,
                    categoryIcon: categories.icon,
                    total: sql<string>`SUM(${rangeSpend.amount})`,
                })
                .from(rangeSpend)
                .innerJoin(categories, eq(rangeSpend.categoryId, categories.id))
                .groupBy(
                    rangeSpend.categoryId,
                    categories.name,
                    categories.color,
                    categories.icon
                )
                .orderBy(sql`SUM(${rangeSpend.amount}) DESC`),

            db
                .select({
                    categoryId: previousSpend.categoryId,
                    total: sql<string>`SUM(${previousSpend.amount})`,
                })
                .from(previousSpend)
                .groupBy(previousSpend.categoryId),

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
                        lte(transactions.date, dateTo),
                        excludeForeign,
                        primarySideOnly
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
                    currency: transactions.currency,
                    accountCurrency: financialAccounts.currency,
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

            baseSavingsAccountIds.length
                ? db
                      .select({
                          total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
                      })
                      .from(transactions)
                      .where(
                          and(
                              eq(transactions.userId, userId),
                              eq(transactions.type, "transfer"),
                              inArray(transactions.toAccountId, baseSavingsAccountIds),
                              gte(transactions.date, dateFrom),
                              lte(transactions.date, dateTo)
                          )
                      )
                : Promise.resolve([{ total: "0" }]),

            options?.anomalies ??
                getSpendingAnomalies(userId, { from: dateFrom, to: dateTo }),
        ]);

    const rangeTotals = rangeTotalsRows[0];

    const { baseAccounts, totalAssets, totalLiabilities, netWorth } =
        summarizeNetWorth(loaded);

    const totalSavings = baseAccounts
        .filter((acc) => savingsTypes.includes(acc.type))
        .reduce((sum, acc) => sum + Number(acc.balance), 0);
    const monthlySavings = Number(savingsRows[0]?.total || 0);

    // What the user can actually spend right now: liquid accounts only
    // (bank, mobile banking, cash) — FDR/DPS and credit are excluded
    const liquidTypes: string[] = [...LIQUID_ACCOUNT_TYPES];
    const spendableBalance = baseAccounts
        .filter((acc) => liquidTypes.includes(acc.type))
        .reduce((sum, acc) => sum + Number(acc.balance), 0);

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
        totalSavings,
        monthlySavings,
        spendableBalance,
        baseCurrency,
        anomalies,
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
