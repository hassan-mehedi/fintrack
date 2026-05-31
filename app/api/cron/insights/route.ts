/**
 * Daily insights cron. Runs anomaly detection for every user. On Sundays
 * (UTC) it also generates a weekly digest. Cost: ~$0.0002/user/week for the
 * digest LLM call; the anomaly detectors are pure SQL + JS.
 *
 * Schedule (vercel.json): daily at 10:00 UTC (16:00 BDT).
 */

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { detectAllForUser } from "@/lib/insights/anomalies";
import { buildWeeklyDigest } from "@/lib/insights/digest";
import { saveInsights } from "@/lib/insights/persist";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorize(req)) return new Response("Unauthorized", { status: 401 });

  const now = new Date();
  const isSundayUTC = now.getUTCDay() === 0;
  const allUsers = await db.select({ id: users.id }).from(users);

  let totalAnomalies = 0;
  let totalDigests = 0;
  let totalDeduped = 0;

  for (const u of allUsers) {
    try {
      const drafts = await detectAllForUser(u.id);
      if (isSundayUTC) {
        const digest = await buildWeeklyDigest(u.id, now);
        if (digest) drafts.push(digest);
      }
      const { written, deduped } = await saveInsights(u.id, drafts);
      totalAnomalies += drafts.filter((d) => d.kind !== "weekly_digest").length;
      totalDigests += drafts.filter((d) => d.kind === "weekly_digest").length;
      totalDeduped += deduped;
      logger.info({ userId: u.id, written, deduped }, "insights cron user");
    } catch (err) {
      logger.error({ err, userId: u.id }, "insights cron user failed");
    }
  }

  return Response.json({
    ok: true,
    users: allUsers.length,
    anomalies: totalAnomalies,
    digests: totalDigests,
    deduped: totalDeduped,
  });
}
