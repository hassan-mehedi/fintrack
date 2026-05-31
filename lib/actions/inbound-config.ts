"use server";

import { db } from "@/lib/db";
import { inboundTokens } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";

// Note: the email-channel ingest (alias generation, rotateEmailAlias, Cloudflare
// Email Worker) was deliberately not shipped. See
// docs/cloudflare-email-routing-setup.md for the rationale. SMS forwarding via
// per-user tokens remains the only inbound path.

/** Length of an SMS forwarder token's secret portion. */
const TOKEN_BYTES = 24;

export async function listSmsTokens() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  return db
    .select({
      id: inboundTokens.id,
      label: inboundTokens.label,
      prefix: inboundTokens.prefix,
      createdAt: inboundTokens.createdAt,
      lastUsedAt: inboundTokens.lastUsedAt,
      revokedAt: inboundTokens.revokedAt,
    })
    .from(inboundTokens)
    .where(eq(inboundTokens.userId, session.user.id))
    .orderBy(desc(inboundTokens.createdAt));
}

/**
 * Creates a new SMS forwarder token. The plaintext token is returned ONCE —
 * we only store its bcrypt hash. The prefix (first 8 characters) is stored
 * so the user can identify the token in the list.
 *
 * The token is delivered to the user as `ft_<prefix><secret>` so they can
 * spot it later.
 */
export async function createSmsToken(label: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Label is required");

  const secret = randomBytes(TOKEN_BYTES).toString("base64url");
  const prefix = secret.slice(0, 8);
  const fullToken = `ft_${secret}`;
  const tokenHash = await hash(fullToken, 10);

  const [row] = await db
    .insert(inboundTokens)
    .values({
      userId: session.user.id,
      label: trimmed,
      tokenHash,
      prefix,
    })
    .returning({ id: inboundTokens.id });

  revalidatePath("/settings");
  return { id: row.id, token: fullToken, prefix };
}

export async function revokeSmsToken(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await db
    .update(inboundTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(inboundTokens.id, id),
        eq(inboundTokens.userId, session.user.id),
        isNull(inboundTokens.revokedAt),
      ),
    );
  revalidatePath("/settings");
}
