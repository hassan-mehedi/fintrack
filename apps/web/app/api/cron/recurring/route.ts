import { runScheduledJobs } from "@fintrack/core/jobs";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const report = await runScheduledJobs();

  logger.info({ path: "/api/cron/recurring", ...report }, "scheduled jobs completed");

  return Response.json(report);
}

export const POST = GET;
