import { db } from "@/lib/db";
import { insights } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { InsightDraft } from "./anomalies";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * Writes drafts to the insights table, skipping any whose dedupeKey already
 * exists for the user. For NEW insights of severity warning/critical, also
 * fires a corresponding push notification through the Phase 8 dispatcher.
 */
export async function saveInsights(
  userId: string,
  drafts: InsightDraft[],
): Promise<{ written: number; deduped: number }> {
  if (drafts.length === 0) return { written: 0, deduped: 0 };

  let written = 0;
  let deduped = 0;

  for (const d of drafts) {
    // Pre-check by dedupeKey — onConflictDoNothing alone would silently swallow
    // the row but we want a count for telemetry.
    const [existing] = await db
      .select({ id: insights.id })
      .from(insights)
      .where(and(eq(insights.userId, userId), eq(insights.dedupeKey, d.dedupeKey)))
      .limit(1);
    if (existing) {
      deduped++;
      continue;
    }

    const [row] = await db
      .insert(insights)
      .values({
        userId,
        kind: d.kind,
        severity: d.severity,
        title: d.title,
        body: d.body,
        payload: d.payload,
        dedupeKey: d.dedupeKey,
      })
      .onConflictDoNothing({
        target: [insights.userId, insights.dedupeKey],
      })
      .returning({ id: insights.id });
    if (!row) {
      deduped++;
      continue;
    }
    written++;

    if (d.severity === "warning" || d.severity === "critical") {
      // Map insight kind → notification kind. We reuse the existing Phase 8
      // notification kinds where possible; otherwise fold into a generic one.
      const notifKind =
        d.kind === "outlier" || d.kind === "duplicate"
          ? "transaction_large"
          : d.kind === "subscription_creep"
            ? "transaction_large"
            : "weekly_digest";
      await dispatchNotification({
        userId,
        kind: notifKind,
        title: d.title,
        body: d.body,
        url: "/dashboard",
        tag: `insight:${row.id}`,
        payload: { insightId: row.id, kind: d.kind },
      }).catch(() => {
        // notifications are best-effort
      });
    }
  }

  return { written, deduped };
}
