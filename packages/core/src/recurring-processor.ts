import { db } from "@fintrack/db";
import {
  recurringTransactions,
  transactions,
  financialAccounts,
} from "@fintrack/db/schema";
import { eq, and, lte, sql, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
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
import { getBalanceDelta } from "./balance";

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

export function getNextDate(lastDate: Date, frequency: Frequency): Date {
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

export interface RecurringRule {
  id: string;
  accountId: string;
  categoryId: string;
  amount: string;
  fee: string;
  type: string;
  description: string;
  frequency: Frequency;
  startDate: string;
  endDate: string | null;
  lastProcessed: string | null;
}

export interface DueOccurrence {
  ruleId: string;
  date: string;
}

export function getDueOccurrences(rule: RecurringRule, today: Date): DueOccurrence[] {
  const todayStr = format(today, "yyyy-MM-dd");
  if (rule.endDate && todayStr > rule.endDate) return [];

  const startFrom = rule.lastProcessed
    ? getNextDate(parseISO(rule.lastProcessed), rule.frequency)
    : parseISO(rule.startDate);

  const due: DueOccurrence[] = [];
  let current = startFrom;

  while (isBefore(current, today) || isEqual(current, today)) {
    const dateStr = format(current, "yyyy-MM-dd");
    if (rule.endDate && dateStr > rule.endDate) break;
    due.push({ ruleId: rule.id, date: dateStr });
    current = getNextDate(current, rule.frequency);
  }

  return due;
}

export async function processRecurringForUser(userId: string) {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  const active = await db
    .select()
    .from(recurringTransactions)
    .where(
      and(
        eq(recurringTransactions.userId, userId),
        eq(recurringTransactions.isActive, true),
        lte(recurringTransactions.startDate, todayStr)
      )
    );

  if (active.length === 0) return { created: 0 };

  const accountIds = [...new Set(active.map((r) => r.accountId))];
  const typeRows = await db
    .select({ id: financialAccounts.id, type: financialAccounts.type })
    .from(financialAccounts)
    .where(inArray(financialAccounts.id, accountIds));
  const accountTypes = new Map(typeRows.map((r) => [r.id, r.type]));

  const newRows: (typeof transactions.$inferInsert)[] = [];
  const balanceDeltas = new Map<string, number>();
  const lastProcessedByRule = new Map<string, string>();

  for (const rule of active) {
    const due = getDueOccurrences(rule, today);
    if (due.length === 0) continue;

    const amount = Number(rule.amount);
    const fee = Number(rule.fee);
    const accountType = accountTypes.get(rule.accountId);

    for (const occurrence of due) {
      newRows.push({
        userId,
        accountId: rule.accountId,
        categoryId: rule.categoryId,
        amount: rule.amount,
        fee: rule.fee,
        type: rule.type,
        description: rule.description,
        date: occurrence.date,
        tags: [],
        recurringId: rule.id,
      });

      if (accountType) {
        const delta = getBalanceDelta(
          accountType, rule.type as "income" | "expense", amount, fee
        );
        balanceDeltas.set(
          rule.accountId, (balanceDeltas.get(rule.accountId) ?? 0) + delta
        );
      }
    }
    lastProcessedByRule.set(rule.id, due[due.length - 1].date);
  }

  if (newRows.length === 0) return { created: 0 };

  const writes: [BatchItem<"pg">, ...BatchItem<"pg">[]] = [
    db.insert(transactions).values(newRows),
  ];

  for (const [accountId, delta] of balanceDeltas) {
    writes.push(
      db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric + ${delta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, accountId))
    );
  }

  for (const [ruleId, dateStr] of lastProcessedByRule) {
    writes.push(
      db
        .update(recurringTransactions)
        .set({ lastProcessed: dateStr })
        .where(eq(recurringTransactions.id, ruleId))
    );
  }

  await db.batch(writes);

  return { created: newRows.length };
}

export async function getUserIdsWithActiveRecurring(): Promise<string[]> {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const rows = await db
    .selectDistinct({ userId: recurringTransactions.userId })
    .from(recurringTransactions)
    .where(
      and(
        eq(recurringTransactions.isActive, true),
        lte(recurringTransactions.startDate, todayStr)
      )
    );
  return rows.map((r) => r.userId);
}
