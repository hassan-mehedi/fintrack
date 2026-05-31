"use server";

import { db } from "@/lib/db";
import { userSessions, users } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { revokeToken } from "@/lib/token-revocation";
import { recordChange } from "@/lib/audit-entity";
import { revalidatePath } from "next/cache";

/**
 * Lists the user's tracked sessions. The session whose `jti` matches the
 * current request is marked with `isCurrent`.
 */
export async function listSessions() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const currentJti = (session as unknown as { jti?: string }).jti ?? null;

  const rows = await db
    .select({
      jti: userSessions.jti,
      userAgent: userSessions.userAgent,
      ipAddress: userSessions.ipAddress,
      createdAt: userSessions.createdAt,
      lastSeenAt: userSessions.lastSeenAt,
      expiresAt: userSessions.expiresAt,
      revokedAt: userSessions.revokedAt,
    })
    .from(userSessions)
    .where(
      and(
        eq(userSessions.userId, session.user.id),
        isNull(userSessions.revokedAt),
      ),
    )
    .orderBy(desc(userSessions.lastSeenAt));

  return rows.map((r) => ({
    ...r,
    isCurrent: currentJti != null && r.jti === currentJti,
  }));
}

/**
 * Revokes one session by its jti. Adds the jti to the revocation list so
 * the next jwt() callback short-circuits with `return null` and forces
 * the device to sign back in.
 */
export async function revokeSession(jti: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [row] = await db
    .select({
      jti: userSessions.jti,
      expiresAt: userSessions.expiresAt,
    })
    .from(userSessions)
    .where(
      and(eq(userSessions.jti, jti), eq(userSessions.userId, session.user.id)),
    )
    .limit(1);
  if (!row) throw new Error("Session not found");

  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(eq(userSessions.jti, jti));

  // Best-effort: add to the revocation list. We need an exp timestamp in
  // seconds — fall back to "now + 24h" if missing.
  const exp = row.expiresAt
    ? Math.floor(row.expiresAt.getTime() / 1000)
    : Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  await revokeToken(jti, exp).catch(() => {});

  await recordChange({
    ctx: { userId: session.user.id },
    entity: "account",
    entityId: session.user.id,
    action: "update",
    before: { revokedSession: jti, action: "revoke" },
    after: { revokedSession: jti, when: new Date() },
  });

  revalidatePath("/settings");
}

/**
 * Revokes EVERY session for the user — including the current one. Implemented
 * by bumping `users.sessionVersion`, which the jwt() callback compares on each
 * call and refuses to mint tokens that don't match.
 */
export async function revokeAllSessions(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, session.user.id));

  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(userSessions.userId, session.user.id),
        isNull(userSessions.revokedAt),
      ),
    );

  await recordChange({
    ctx: { userId: session.user.id },
    entity: "account",
    entityId: session.user.id,
    action: "update",
    before: { revokeAll: false },
    after: { revokeAll: true, when: new Date() },
  });

  revalidatePath("/settings");
}
