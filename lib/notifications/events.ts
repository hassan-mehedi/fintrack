import { db } from "@/lib/db";
import {
  transactions,
  budgets,
  categories,
  financialAccounts,
} from "@/lib/db/schema";
import { and, eq, gte, lte, sql, isNull } from "drizzle-orm";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { dispatchNotification, getPreferences } from "./dispatch";
import type { ParsedTransaction } from "@/lib/inbound/types";

/**
 * Fires AFTER an inbound message has been persisted. Surfaces a tap-to-review
 * push so the user can land on /inbox without checking the app.
 */
export async function onInboundIngested(args: {
  userId: string;
  status: "parsed" | "needs_review" | "failed";
  templateId: string | null;
  parsed: ParsedTransaction | null;
  inboundMessageId: string;
}): Promise<void> {
  if (args.status === "failed") return;
  const kind = args.status === "parsed" ? "inbound_parsed" : "inbound_needs_review";
  const amount = args.parsed?.amount;
  const merchant = args.parsed?.merchant;
  const direction = args.parsed?.direction === "in" ? "+" : "-";
  const title =
    args.status === "parsed"
      ? "Ready to log"
      : "Needs review";
  const body =
    amount != null
      ? `${direction}${amount.toLocaleString()} ${args.parsed?.currency ?? ""} ${merchant ?? ""}`.trim()
      : merchant ?? "New inbound message";
  await dispatchNotification({
    userId: args.userId,
    kind,
    title,
    body,
    url: "/inbox",
    // Coalesce per-day so a flurry of forwards doesn't spam.
    tag: `inbox:${kind}:${new Date().toISOString().slice(0, 10)}`,
    payload: { inboundMessageId: args.inboundMessageId, templateId: args.templateId },
  });
}

/**
 * Fires AFTER a transaction is posted to the ledger. Two checks:
 *   1. Was a budget for this category just exceeded (or crossed the warning)?
 *   2. Is the amount unusually large (above the user's threshold)?
 */
export async function onTransactionPosted(args: {
  userId: string;
  transactionId: string;
  type: "income" | "expense" | "transfer";
  categoryId: string;
  amount: number;
  date: string;
}): Promise<void> {
  if (args.type !== "expense") return;

  const prefs = await getPreferences(args.userId);

  if (prefs.notifyLargeTransaction) {
    const threshold = prefs.largeTransactionThreshold
      ? Number(prefs.largeTransactionThreshold)
      : null;
    if (threshold !== null && args.amount >= threshold) {
      await dispatchNotification({
        userId: args.userId,
        kind: "transaction_large",
        title: "Large expense",
        body: `An expense of ${args.amount.toLocaleString()} just posted.`,
        url: `/transactions?focus=${args.transactionId}`,
        tag: `large:${args.transactionId}`,
      });
    }
  }

  await checkBudget({
    userId: args.userId,
    categoryId: args.categoryId,
    date: args.date,
    addedAmount: args.amount,
    warningPercent: prefs.budgetWarningPercent,
    notifyExceeded: prefs.notifyBudgetExceeded,
    notifyWarning: prefs.notifyBudgetWarning,
  });
}

/**
 * Pure threshold check exposed for tests. Given the budget amount, the
 * spending before this transaction, and the new amount, returns which event
 * (if any) the transaction *just* crossed.
 */
export function classifyBudgetThreshold(args: {
  budgetAmount: number;
  spentBefore: number;
  addedAmount: number;
  warningPercent: number; // 0-100
}): "exceeded" | "warning" | null {
  const warningLine = (args.budgetAmount * args.warningPercent) / 100;
  const spentAfter = args.spentBefore + args.addedAmount;
  if (args.spentBefore < args.budgetAmount && spentAfter >= args.budgetAmount) {
    return "exceeded";
  }
  if (args.spentBefore < warningLine && spentAfter >= warningLine) {
    return "warning";
  }
  return null;
}

async function checkBudget(args: {
  userId: string;
  categoryId: string;
  date: string;
  addedAmount: number;
  warningPercent: number;
  notifyExceeded: boolean;
  notifyWarning: boolean;
}): Promise<void> {
  if (!args.notifyExceeded && !args.notifyWarning) return;

  const d = new Date(args.date + "T00:00:00Z");
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();
  const monthStart = format(startOfMonth(d), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(d), "yyyy-MM-dd");

  const [budget] = await db
    .select({
      id: budgets.id,
      amount: budgets.amount,
      categoryName: categories.name,
      categoryIcon: categories.icon,
    })
    .from(budgets)
    .innerJoin(categories, eq(budgets.categoryId, categories.id))
    .where(
      and(
        eq(budgets.userId, args.userId),
        eq(budgets.categoryId, args.categoryId),
        eq(budgets.month, month),
        eq(budgets.year, year),
      ),
    )
    .limit(1);
  if (!budget) return;

  // Sum month-to-date expenses for the category INCLUDING the just-posted txn,
  // then back out the addedAmount to get spentBefore.
  const [spent] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric + ${transactions.fee}::numeric), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, args.userId),
        eq(transactions.categoryId, args.categoryId),
        eq(transactions.type, "expense"),
        isNull(transactions.deletedAt),
        gte(transactions.date, monthStart),
        lte(transactions.date, monthEnd),
      ),
    );

  const spentAfter = Number(spent?.total ?? 0);
  const spentBefore = spentAfter - args.addedAmount;
  const budgetAmount = Number(budget.amount);

  const crossing = classifyBudgetThreshold({
    budgetAmount,
    spentBefore,
    addedAmount: args.addedAmount,
    warningPercent: args.warningPercent,
  });
  if (!crossing) return;

  if (crossing === "exceeded" && args.notifyExceeded) {
    await dispatchNotification({
      userId: args.userId,
      kind: "budget_exceeded",
      title: `Budget exceeded · ${budget.categoryName}`,
      body: `Spent ${spentAfter.toLocaleString()} of ${budgetAmount.toLocaleString()} this month.`,
      url: "/budgets",
      tag: `budget:${budget.id}:exceeded:${year}-${month}`,
      payload: { budgetId: budget.id, categoryId: args.categoryId, spentAfter, budgetAmount },
    });
  } else if (crossing === "warning" && args.notifyWarning) {
    await dispatchNotification({
      userId: args.userId,
      kind: "budget_warning",
      title: `Budget ${args.warningPercent}% used · ${budget.categoryName}`,
      body: `Spent ${spentAfter.toLocaleString()} of ${budgetAmount.toLocaleString()} this month.`,
      url: "/budgets",
      tag: `budget:${budget.id}:warning:${year}-${month}`,
      payload: { budgetId: budget.id, categoryId: args.categoryId, spentAfter, budgetAmount },
    });
  }
}

/**
 * Pure helper used by the bill cron: given a recurring rule and today's
 * date, what's the next expected occurrence?
 */
export function nextOccurrenceAfter(
  lastProcessed: string | null,
  startDate: string,
  frequency: "daily" | "weekly" | "monthly" | "yearly",
): Date {
  const anchor = lastProcessed ?? startDate;
  const d = new Date(anchor + "T00:00:00Z");
  switch (frequency) {
    case "daily":
      d.setUTCDate(d.getUTCDate() + 1);
      break;
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case "yearly":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
  }
  return d;
}

/**
 * Checks one account's balance against the user's low-balance threshold.
 * Called by the daily cron, not on every transaction.
 */
export async function checkLowBalanceForUser(userId: string): Promise<void> {
  const prefs = await getPreferences(userId);
  if (!prefs.notifyLowBalance || prefs.lowBalanceThreshold == null) return;
  const threshold = Number(prefs.lowBalanceThreshold);

  const accs = await db
    .select({
      id: financialAccounts.id,
      name: financialAccounts.name,
      balance: financialAccounts.balance,
      type: financialAccounts.type,
    })
    .from(financialAccounts)
    .where(
      and(
        eq(financialAccounts.userId, userId),
        eq(financialAccounts.status, "active"),
      ),
    );

  for (const a of accs) {
    if (a.type === "credit_card" || a.type === "loan") continue;
    const balance = Number(a.balance);
    if (balance < threshold) {
      await dispatchNotification({
        userId,
        kind: "balance_low",
        title: `Low balance · ${a.name}`,
        body: `Balance is ${balance.toLocaleString()} (threshold ${threshold.toLocaleString()}).`,
        url: "/accounts",
        tag: `low:${a.id}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
  }
}
