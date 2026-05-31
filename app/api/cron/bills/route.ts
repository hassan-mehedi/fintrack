/**
 * Daily bill-reminder cron. Scans active recurring transactions across all
 * users and fires `bill_due` (within billReminderDaysBefore) or `bill_overdue`
 * (past due) push notifications.
 *
 * Vercel Cron invokes this with an `Authorization: Bearer <CRON_SECRET>`
 * header (the value of `CRON_SECRET` env). Local invocation can use the
 * same header.
 *
 * Schedule: see vercel.json — daily at 09:00 UTC (15:00 BDT).
 */

import { db } from "@/lib/db";
import {
  recurringTransactions,
  financialAccounts,
  notificationPreferences,
  users,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { checkLowBalanceForUser, nextOccurrenceAfter } from "@/lib/notifications/events";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

function diffDays(a: Date, b: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.round(
    (Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()) -
      Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())) /
      MS,
  );
}

type Bill = {
  id: string;
  userId: string;
  amount: string;
  type: "income" | "expense" | "transfer";
  description: string;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  startDate: string;
  endDate: string | null;
  lastProcessed: string | null;
  accountName: string | null;
};

export async function GET(req: Request) {
  if (!authorize(req)) return new Response("Unauthorized", { status: 401 });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Pull all active expense recurrings. We don't notify on income recurrings.
  const bills: Bill[] = await db
    .select({
      id: recurringTransactions.id,
      userId: recurringTransactions.userId,
      amount: recurringTransactions.amount,
      type: recurringTransactions.type,
      description: recurringTransactions.description,
      frequency: recurringTransactions.frequency,
      startDate: recurringTransactions.startDate,
      endDate: recurringTransactions.endDate,
      lastProcessed: recurringTransactions.lastProcessed,
      accountName: financialAccounts.name,
    })
    .from(recurringTransactions)
    .leftJoin(
      financialAccounts,
      eq(recurringTransactions.accountId, financialAccounts.id),
    )
    .where(
      and(
        eq(recurringTransactions.isActive, true),
        eq(recurringTransactions.type, "expense"),
      ),
    );

  // Cache user preferences to avoid one-row-per-bill round trips.
  const prefsCache = new Map<
    string,
    { daysBefore: number; enabled: boolean }
  >();
  async function getPrefs(userId: string) {
    let p = prefsCache.get(userId);
    if (p) return p;
    const [row] = await db
      .select({
        notifyBillDueSoon: notificationPreferences.notifyBillDueSoon,
        billReminderDaysBefore: notificationPreferences.billReminderDaysBefore,
      })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);
    p = {
      enabled: row?.notifyBillDueSoon ?? true,
      daysBefore: row?.billReminderDaysBefore ?? 3,
    };
    prefsCache.set(userId, p);
    return p;
  }

  let sent = 0;
  let skipped = 0;
  for (const bill of bills) {
    const prefs = await getPrefs(bill.userId);
    if (!prefs.enabled) {
      skipped++;
      continue;
    }

    const next = nextOccurrenceAfter(bill.lastProcessed, bill.startDate, bill.frequency);
    if (bill.endDate && next.toISOString().slice(0, 10) > bill.endDate) {
      skipped++;
      continue;
    }

    const daysUntil = diffDays(next, today);
    let kind: "bill_due" | "bill_overdue" | null = null;
    if (daysUntil < 0) kind = "bill_overdue";
    else if (daysUntil <= prefs.daysBefore) kind = "bill_due";
    if (!kind) {
      skipped++;
      continue;
    }

    const amount = Number(bill.amount).toLocaleString();
    const label = bill.description || "Recurring transaction";
    const dueIso = next.toISOString().slice(0, 10);
    const tag = `bill:${bill.id}:${dueIso}:${kind}`;

    await dispatchNotification({
      userId: bill.userId,
      kind,
      title:
        kind === "bill_overdue"
          ? `Overdue · ${label}`
          : daysUntil === 0
            ? `Due today · ${label}`
            : `Due in ${daysUntil}d · ${label}`,
      body: `${amount}${bill.accountName ? ` · ${bill.accountName}` : ""}`,
      url: "/recurring",
      tag,
      payload: { recurringId: bill.id, dueDate: dueIso, daysUntil },
    });
    sent++;
  }

  // Also do a daily low-balance sweep per user (only for those with the pref on).
  const allUsers = await db.select({ id: users.id }).from(users);
  let lowChecked = 0;
  for (const u of allUsers) {
    try {
      await checkLowBalanceForUser(u.id);
      lowChecked++;
    } catch (err) {
      logger.warn({ err, userId: u.id }, "low-balance check failed");
    }
  }

  logger.info({ sent, skipped, lowChecked }, "bill cron ran");
  return Response.json({ ok: true, sent, skipped, lowChecked });
}
