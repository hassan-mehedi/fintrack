import { db } from "@fintrack/db";
import {
    budgets,
    budgetAlerts,
    transactions,
    categories,
    users,
} from "@fintrack/db/schema";
import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { categorySpend } from "./analytics";
import { sendEmail, isEmailConfigured, renderEmail } from "./email";
import { getCurrencyInfo } from "@fintrack/shared/currencies";

export const ALERT_THRESHOLDS = [100, 90] as const;

export function getCrossedThreshold(
    spent: number,
    budgetAmount: number,
    alreadySent: number[]
): number | null {
    if (budgetAmount <= 0) return null;
    const percent = (spent / budgetAmount) * 100;
    for (const threshold of ALERT_THRESHOLDS) {
        if (percent >= threshold && !alreadySent.includes(threshold)) {
            return threshold;
        }
    }
    return null;
}

export interface BudgetAlertResult {
    sent: number;
    failures: { budgetId: string; threshold: number; error: unknown }[];
}

export async function checkBudgetAlerts(): Promise<BudgetAlertResult> {
    if (!isEmailConfigured()) return { sent: 0, failures: [] };

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const dateStart = format(startOfMonth(now), "yyyy-MM-dd");
    const dateEnd = format(endOfMonth(now), "yyyy-MM-dd");

    const budgetRows = await db
        .select({
            id: budgets.id,
            userId: budgets.userId,
            categoryId: budgets.categoryId,
            amount: budgets.amount,
            categoryName: categories.name,
            userName: users.name,
            userEmail: users.email,
            userCurrency: users.currency,
        })
        .from(budgets)
        .innerJoin(categories, eq(budgets.categoryId, categories.id))
        .innerJoin(users, eq(budgets.userId, users.id))
        .where(and(eq(budgets.month, month), eq(budgets.year, year)));

    if (budgetRows.length === 0) return { sent: 0, failures: [] };

    // Spend is split-aware: a split transaction counts against its splits'
    // categories, not its own (see categorySpend)
    const spend = categorySpend(
        and(
            eq(transactions.type, "expense"),
            gte(transactions.date, dateStart),
            lte(transactions.date, dateEnd)
        )
    );

    const [spending, sentRows] = await db.batch([
        db
            .select({
                userId: spend.userId,
                categoryId: spend.categoryId,
                spent: sql<string>`SUM(${spend.amount})`,
            })
            .from(spend)
            .groupBy(spend.userId, spend.categoryId),
        db
            .select({
                budgetId: budgetAlerts.budgetId,
                threshold: budgetAlerts.threshold,
            })
            .from(budgetAlerts)
            .where(inArray(budgetAlerts.budgetId, budgetRows.map((b) => b.id))),
    ]);

    const spentMap = new Map(
        spending.map((s) => [`${s.userId}:${s.categoryId}`, Number(s.spent)])
    );
    const sentMap = new Map<string, number[]>();
    for (const row of sentRows) {
        const list = sentMap.get(row.budgetId) ?? [];
        list.push(row.threshold);
        sentMap.set(row.budgetId, list);
    }

    const result: BudgetAlertResult = { sent: 0, failures: [] };

    for (const budget of budgetRows) {
        const spent = spentMap.get(`${budget.userId}:${budget.categoryId}`) ?? 0;
        const budgetAmount = Number(budget.amount);
        const threshold = getCrossedThreshold(
            spent,
            budgetAmount,
            sentMap.get(budget.id) ?? []
        );
        if (!threshold) continue;

        const currency = getCurrencyInfo(budget.userCurrency ?? "BDT");
        const percent = Math.round((spent / budgetAmount) * 100);
        const subject =
            threshold >= 100
                ? `Budget exceeded: ${budget.categoryName}`
                : `Budget warning: ${budget.categoryName} at ${percent}%`;
        const summary = `You've spent ${currency.symbol}${spent.toFixed(2)} of your ${currency.symbol}${budgetAmount.toFixed(2)} ${budget.categoryName} budget this month (${percent}%).`;

        try {
            await sendEmail({
                to: budget.userEmail,
                subject,
                ...renderEmail(
                    threshold >= 100 ? "Budget exceeded" : "Budget warning",
                    budget.userName,
                    [summary, "Open FinTrack to review your spending."]
                ),
            });
            await db
                .insert(budgetAlerts)
                .values({ budgetId: budget.id, threshold })
                .onConflictDoNothing();
            result.sent++;
        } catch (error) {
            result.failures.push({ budgetId: budget.id, threshold, error });
        }
    }

    return result;
}
