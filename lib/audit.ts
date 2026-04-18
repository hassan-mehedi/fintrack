import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

type AuditAction = "login_success" | "login_failed" | "logout" | "register";

export async function createAuditLog({
  action,
  userId,
  ipAddress,
  userAgent,
  metadata,
}: {
  action: AuditAction;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await db.insert(auditLogs).values({
    action,
    userId: userId ?? null,
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
    metadata: metadata ?? null,
  });
}
