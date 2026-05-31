import { db } from "@/lib/db";
import { notifications, notificationPreferences } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendPushToUser, type PushPayload } from "@/lib/push/web-push";
import { logger } from "@/lib/logger";
import type { NotificationPreferences } from "@/lib/types";

export type NotificationKind =
  | "inbound_parsed"
  | "inbound_needs_review"
  | "budget_exceeded"
  | "budget_warning"
  | "transaction_large"
  | "bill_due"
  | "bill_overdue"
  | "balance_low"
  | "weekly_digest";

/**
 * Default preferences applied when a user hasn't customised them yet.
 * Stored shape matches the table; PK userId is set by the caller.
 */
function defaultPreferences(): Omit<NotificationPreferences, "userId" | "updatedAt"> {
  return {
    pushEnabled: true,
    notifyInboundParsed: true,
    notifyInboundNeedsReview: true,
    notifyBudgetExceeded: true,
    notifyBudgetWarning: false,
    budgetWarningPercent: 80,
    notifyLargeTransaction: true,
    largeTransactionThreshold: null,
    notifyBillDueSoon: true,
    billReminderDaysBefore: 3,
    notifyLowBalance: false,
    lowBalanceThreshold: null,
    weeklyDigest: false,
  };
}

export async function getPreferences(userId: string): Promise<NotificationPreferences> {
  const [existing] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  if (existing) return existing;

  const defaults = defaultPreferences();
  const [created] = await db
    .insert(notificationPreferences)
    .values({ userId, ...defaults })
    .returning();
  return created;
}

function isEnabled(prefs: NotificationPreferences, kind: NotificationKind): boolean {
  switch (kind) {
    case "inbound_parsed":
      return prefs.notifyInboundParsed;
    case "inbound_needs_review":
      return prefs.notifyInboundNeedsReview;
    case "budget_exceeded":
      return prefs.notifyBudgetExceeded;
    case "budget_warning":
      return prefs.notifyBudgetWarning;
    case "transaction_large":
      return prefs.notifyLargeTransaction;
    case "bill_due":
    case "bill_overdue":
      return prefs.notifyBillDueSoon;
    case "balance_low":
      return prefs.notifyLowBalance;
    case "weekly_digest":
      return prefs.weeklyDigest;
  }
}

export type DispatchArgs = {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Deep-link path (e.g. "/inbox") opened on tap. */
  url?: string;
  /** Coalesce key — repeat dispatches with the same tag replace the prior one. */
  tag?: string;
  /** Extra payload stored on the notification row. */
  payload?: Record<string, unknown>;
};

/**
 * Writes an in-app notification row AND pushes to all the user's active
 * subscriptions, respecting their preferences.
 *
 * Best-effort: a failure to push won't roll back the in-app row, so the
 * notification still appears in the bell dropdown when the user opens the
 * app.
 */
export async function dispatchNotification(args: DispatchArgs): Promise<void> {
  const prefs = await getPreferences(args.userId);
  if (!isEnabled(prefs, args.kind)) return;

  const [row] = await db
    .insert(notifications)
    .values({
      userId: args.userId,
      kind: args.kind,
      title: args.title,
      body: args.body,
      payload: args.payload ?? null,
      deliveryStatus: prefs.pushEnabled ? "pending" : "skipped",
    })
    .returning({ id: notifications.id });

  if (!prefs.pushEnabled) return;

  const payload: PushPayload = {
    title: args.title,
    body: args.body,
    url: args.url,
    tag: args.tag ?? `${args.kind}:${row.id}`,
    data: { notificationId: row.id, kind: args.kind, ...args.payload },
  };

  try {
    await sendPushToUser(args.userId, payload);
    await db
      .update(notifications)
      .set({ deliveryStatus: "delivered" })
      .where(eq(notifications.id, row.id));
  } catch (err) {
    logger.warn({ err, userId: args.userId, kind: args.kind }, "push delivery failed");
    await db
      .update(notifications)
      .set({ deliveryStatus: "failed" })
      .where(eq(notifications.id, row.id));
  }
}
