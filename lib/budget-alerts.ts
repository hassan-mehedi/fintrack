import { db } from "@/lib/db";
import {
  budgets,
  budgetAlerts,
  transactions,
  categories,
  users,
} from "@/lib/db/schema";
import { eq, and, sql, gte, lte, inArray } from "drizzle-orm";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { sendEmail, isEmailConfigured, escapeHtml } from "@/lib/email";
import { getCurrencyInfo } from "@/lib/currencies";
import { logger } from "@/lib/logger";

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

export async function checkBudgetAlerts(): Promise<number> {
  if (!isEmailConfigured()) return 0;

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

  if (budgetRows.length === 0) return 0;

  const [spending, sentRows] = await Promise.all([
    db
      .select({
        userId: transactions.userId,
        categoryId: transactions.categoryId,
        spent: sql<string>`SUM(${transactions.amount}::numeric + ${transactions.fee}::numeric)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.type, "expense"),
          gte(transactions.date, dateStart),
          lte(transactions.date, dateEnd)
        )
      )
      .groupBy(transactions.userId, transactions.categoryId),
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

  let sentCount = 0;

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
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
            <h1 style="font-size: 22px; margin-bottom: 12px;">${threshold >= 100 ? "Budget exceeded" : "Budget warning"}</h1>
            <p>Hello ${escapeHtml(budget.userName)},</p>
            <p>${escapeHtml(summary)}</p>
            <p>Open FinTrack to review your spending.</p>
          </div>
        `,
        text: `Hello ${budget.userName},\n\n${summary}\n\nOpen FinTrack to review your spending.`,
      });
      await db
        .insert(budgetAlerts)
        .values({ budgetId: budget.id, threshold })
        .onConflictDoNothing();
      sentCount++;
    } catch (error) {
      logger.error(
        { budgetId: budget.id, threshold, error },
        "budget alert email failed"
      );
    }
  }

  return sentCount;
}
