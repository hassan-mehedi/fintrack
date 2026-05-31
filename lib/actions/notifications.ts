"use server";

import { db } from "@/lib/db";
import { notifications, notificationPreferences } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getPreferences } from "@/lib/notifications/dispatch";
import { z } from "zod";

export async function listNotifications(limit = 30) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      payload: notifications.payload,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, session.user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function countUnreadNotifications() {
  const session = await auth();
  if (!session?.user?.id) return 0;
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, session.user.id), isNull(notifications.readAt)),
    );
  return Number(row?.count ?? 0);
}

export async function markNotificationRead(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, session.user.id),
        isNull(notifications.readAt),
      ),
    );
  revalidatePath("/");
}

export async function markAllNotificationsRead() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.userId, session.user.id), isNull(notifications.readAt)),
    );
  revalidatePath("/");
}

export async function loadPreferences() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return getPreferences(session.user.id);
}

const updateSchema = z.object({
  pushEnabled: z.boolean().optional(),
  notifyInboundParsed: z.boolean().optional(),
  notifyInboundNeedsReview: z.boolean().optional(),
  notifyBudgetExceeded: z.boolean().optional(),
  notifyBudgetWarning: z.boolean().optional(),
  budgetWarningPercent: z.number().int().min(1).max(99).optional(),
  notifyLargeTransaction: z.boolean().optional(),
  largeTransactionThreshold: z.string().nullable().optional(),
  notifyBillDueSoon: z.boolean().optional(),
  billReminderDaysBefore: z.number().int().min(0).max(30).optional(),
  notifyLowBalance: z.boolean().optional(),
  lowBalanceThreshold: z.string().nullable().optional(),
  weeklyDigest: z.boolean().optional(),
});

export async function updatePreferences(patch: unknown) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const parsed = updateSchema.parse(patch);
  await getPreferences(session.user.id); // ensure row exists
  await db
    .update(notificationPreferences)
    .set({ ...parsed, updatedAt: new Date() })
    .where(eq(notificationPreferences.userId, session.user.id));
  revalidatePath("/settings");
  return getPreferences(session.user.id);
}
