import {
  processRecurringForUser,
  getUserIdsWithActiveRecurring,
} from "@fintrack/core/recurring-processor";
import { checkBudgetAlerts } from "@/lib/budget-alerts";
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
  const start = Date.now();

  if (!isAuthorized(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userIds = await getUserIdsWithActiveRecurring();
  let created = 0;
  let failures = 0;

  for (const userId of userIds) {
    try {
      const result = await processRecurringForUser(userId);
      created += result.created;
    } catch (error) {
      failures++;
      logger.error({ userId, error }, "recurring cron: failed for user");
    }
  }

  let alertsSent = 0;
  try {
    alertsSent = await checkBudgetAlerts();
  } catch (error) {
    logger.error({ error }, "recurring cron: budget alerts failed");
  }

  logger.info(
    {
      path: "/api/cron/recurring",
      users: userIds.length,
      created,
      failures,
      alertsSent,
      duration: Date.now() - start,
    },
    "recurring cron completed"
  );

  return Response.json({ users: userIds.length, created, failures, alertsSent });
}

export const POST = GET;
