import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  transactions,
  financialAccounts,
  categories,
  budgets,
} from "@/lib/db/schema";
import { eq, and, sql, gte, lte, desc, ilike } from "drizzle-orm";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { isLiabilityAccount } from "@/lib/accounts";

export const getFinancialSummary = createTool({
  id: "get-financial-summary",
  description:
    "Get the user's financial summary including total balance across all accounts, income and expenses for a date range, and 6-month spending trend. Use this when the user asks about their overall finances, balances, or monthly summary.",
  inputSchema: z.object({
    from: z
      .string()
      .describe("Start date in YYYY-MM-DD format. Defaults to start of current month."),
    to: z
      .string()
      .describe("End date in YYYY-MM-DD format. Defaults to end of current month."),
  }),
  outputSchema: z.object({
    totalBalance: z.number(),
    totalAssets: z.number(),
    totalLiabilities: z.number(),
    netWorth: z.number(),
    monthlyIncome: z.number(),
    monthlyExpense: z.number(),
    monthlyFees: z.number(),
    accounts: z.array(
      z.object({
        name: z.string(),
        type: z.string(),
        balance: z.number(),
        classification: z.string(),
      })
    ),
    spendingByCategory: z.array(
      z.object({
        categoryName: z.string(),
        total: z.number(),
      })
    ),
    monthlyTrend: z.array(
      z.object({
        month: z.string(),
        income: z.number(),
        expense: z.number(),
      })
    ),
  }),
  execute: async (inputData, context) => {
    const userId = context?.requestContext?.get("userId") as string;
    const now = new Date();
    const dateFrom = inputData.from || format(startOfMonth(now), "yyyy-MM-dd");
    const dateTo = inputData.to || format(endOfMonth(now), "yyyy-MM-dd");

    const accounts = await db
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.userId, userId));

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

    const spendingByCategory = await db
      .select({
        categoryName: categories.name,
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
      .groupBy(categories.name)
      .orderBy(
        sql`SUM(${transactions.amount}::numeric + ${transactions.fee}::numeric) DESC`
      );

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

    const totalAssets = accounts
      .filter((acc) => !isLiabilityAccount(acc.type))
      .reduce((sum, acc) => sum + Number(acc.balance), 0);
    const totalLiabilities = accounts
      .filter((acc) => isLiabilityAccount(acc.type))
      .reduce((sum, acc) => sum + Number(acc.balance), 0);
    const netWorth = totalAssets - totalLiabilities;

    return {
      totalBalance: netWorth,
      totalAssets,
      totalLiabilities,
      netWorth,
      monthlyIncome: Number(rangeTotals?.totalIncome || 0),
      monthlyExpense: Number(rangeTotals?.totalExpense || 0),
      monthlyFees: Number(rangeTotals?.totalFees || 0),
      accounts: accounts.map((a) => ({
        name: a.name,
        type: a.type,
        balance: Number(a.balance),
        classification: isLiabilityAccount(a.type) ? "liability" : "asset",
      })),
      spendingByCategory: spendingByCategory.map((s) => ({
        categoryName: s.categoryName,
        total: Number(s.total),
      })),
      monthlyTrend: monthlyTrend.map((t) => ({
        month: t.month,
        income: Number(t.income),
        expense: Number(t.expense),
      })),
    };
  },
});

export const getTransactionsList = createTool({
  id: "get-transactions-list",
  description:
    "Search and list the user's transactions with optional filters. Use this when the user asks about specific transactions, recent spending, or wants to find particular expenses/income entries.",
  inputSchema: z.object({
    type: z
      .enum(["income", "expense", "transfer"])
      .optional()
      .describe("Filter by transaction type"),
    search: z
      .string()
      .optional()
      .describe("Search term to match against transaction descriptions"),
    startDate: z
      .string()
      .optional()
      .describe("Filter transactions from this date (YYYY-MM-DD)"),
    endDate: z
      .string()
      .optional()
      .describe("Filter transactions up to this date (YYYY-MM-DD)"),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of transactions to return. Defaults to 20."),
  }),
  outputSchema: z.object({
    transactions: z.array(
      z.object({
        id: z.string(),
        amount: z.number(),
        fee: z.number(),
        type: z.string(),
        description: z.string(),
        date: z.string(),
        categoryName: z.string(),
        accountName: z.string(),
      })
    ),
    total: z.number(),
  }),
  execute: async (inputData, context) => {
    const userId = context?.requestContext?.get("userId") as string;
    const limit = inputData.limit || 20;

    const conditions = [eq(transactions.userId, userId)];

    if (inputData.type) {
      conditions.push(eq(transactions.type, inputData.type));
    }
    if (inputData.startDate) {
      conditions.push(gte(transactions.date, inputData.startDate));
    }
    if (inputData.endDate) {
      conditions.push(lte(transactions.date, inputData.endDate));
    }
    if (inputData.search) {
      conditions.push(ilike(transactions.description, `%${inputData.search}%`));
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
          categoryName: categories.name,
          accountName: financialAccounts.name,
        })
        .from(transactions)
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .innerJoin(
          financialAccounts,
          eq(transactions.accountId, financialAccounts.id)
        )
        .where(and(...conditions))
        .orderBy(desc(transactions.date), desc(transactions.createdAt))
        .limit(limit),
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
    };
  },
});

export const getBudgetStatus = createTool({
  id: "get-budget-status",
  description:
    "Get budget status showing budgeted amounts vs actual spending for each category in a given month. Use this when the user asks about their budgets, overspending, or budget progress.",
  inputSchema: z.object({
    month: z.number().describe("Month number (1-12)"),
    year: z.number().describe("Four-digit year"),
  }),
  outputSchema: z.object({
    budgets: z.array(
      z.object({
        categoryName: z.string(),
        budgetAmount: z.number(),
        spent: z.number(),
        remaining: z.number(),
        percentUsed: z.number(),
      })
    ),
  }),
  execute: async (inputData, context) => {
    const userId = context?.requestContext?.get("userId") as string;
    const { month, year } = inputData;

    const dateStart = format(
      startOfMonth(new Date(year, month - 1)),
      "yyyy-MM-dd"
    );
    const dateEnd = format(
      endOfMonth(new Date(year, month - 1)),
      "yyyy-MM-dd"
    );

    const budgetData = await db
      .select({
        amount: budgets.amount,
        categoryName: categories.name,
      })
      .from(budgets)
      .innerJoin(categories, eq(budgets.categoryId, categories.id))
      .where(
        and(
          eq(budgets.userId, userId),
          eq(budgets.month, month),
          eq(budgets.year, year)
        )
      );

    const spending = await db
      .select({
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        spent: sql<string>`SUM(${transactions.amount}::numeric + ${transactions.fee}::numeric)`,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "expense"),
          gte(transactions.date, dateStart),
          lte(transactions.date, dateEnd)
        )
      )
      .groupBy(transactions.categoryId, categories.name);

    const spendingMap = new Map(
      spending.map((s) => [s.categoryName, Number(s.spent)])
    );

    return {
      budgets: budgetData.map((b) => {
        const budgetAmount = Number(b.amount);
        const spent = spendingMap.get(b.categoryName) || 0;
        return {
          categoryName: b.categoryName,
          budgetAmount,
          spent,
          remaining: budgetAmount - spent,
          percentUsed: budgetAmount > 0 ? (spent / budgetAmount) * 100 : 0,
        };
      }),
    };
  },
});

export const getAccountsList = createTool({
  id: "get-accounts-list",
  description:
    "Get all financial accounts with their current balances. Use this when the user asks about their accounts, bank balances, or wants to know where their money is.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    accounts: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        balance: z.number(),
        icon: z.string(),
        classification: z.string(),
      })
    ),
    totalBalance: z.number(),
    totalAssets: z.number(),
    totalLiabilities: z.number(),
    netWorth: z.number(),
  }),
  execute: async (_inputData, context) => {
    const userId = context?.requestContext?.get("userId") as string;

    const accounts = await db
      .select()
      .from(financialAccounts)
      .where(eq(financialAccounts.userId, userId));

    const totalAssets = accounts
      .filter((acc) => !isLiabilityAccount(acc.type))
      .reduce((sum, acc) => sum + Number(acc.balance), 0);
    const totalLiabilities = accounts
      .filter((acc) => isLiabilityAccount(acc.type))
      .reduce((sum, acc) => sum + Number(acc.balance), 0);
    const netWorth = totalAssets - totalLiabilities;

    return {
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        balance: Number(a.balance),
        icon: a.icon,
        classification: isLiabilityAccount(a.type) ? "liability" : "asset",
      })),
      totalBalance: netWorth,
      totalAssets,
      totalLiabilities,
      netWorth,
    };
  },
});
