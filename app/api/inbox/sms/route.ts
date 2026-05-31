/**
 * SMS forwarder webhook. Used by a Tasker / MacroDroid / iSMS recipe on the
 * user's phone that watches for transactional SMS senders (bKash, Nagad,
 * etc.) and forwards them here.
 *
 * Authentication: `Authorization: Bearer ft_<token>` where the token was
 * issued by `createSmsToken`. We store only a bcrypt hash, so verification
 * walks the user's active tokens.
 *
 * Body (JSON):
 *   {
 *     sender:    "bkash",                  // SMS sender id / number
 *     body:      "Send Money Tk 100 …",
 *     receivedAt: "2024-03-12T14:30:00Z",   // optional; defaults to now
 *     simIndex?: number                     // optional, ignored
 *   }
 */

import { db } from "@/lib/db";
import { inboundTokens } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { ingestInbound } from "@/lib/inbound/pipeline";
import { inboundSmsLimiter } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { compare } from "bcryptjs";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  sender: z.string().max(64).optional().nullable(),
  body: z.string().min(1).max(5000),
  receivedAt: z.string().datetime().optional(),
});

async function resolveToken(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  if (!token.startsWith("ft_")) return null;
  const prefix = token.slice(3, 11);

  // Narrow by prefix to keep bcrypt verification O(1) for most callers.
  const candidates = await db
    .select({
      id: inboundTokens.id,
      userId: inboundTokens.userId,
      tokenHash: inboundTokens.tokenHash,
    })
    .from(inboundTokens)
    .where(and(eq(inboundTokens.prefix, prefix), isNull(inboundTokens.revokedAt)));

  for (const c of candidates) {
    if (await compare(token, c.tokenHash)) {
      // touch lastUsedAt (fire-and-forget)
      db.update(inboundTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(inboundTokens.id, c.id))
        .catch(() => {});
      return c.userId;
    }
  }
  return null;
}

export async function POST(req: Request) {
  const userId = await resolveToken(req.headers.get("authorization"));
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const limit = await inboundSmsLimiter(userId);
  if (!limit.success) {
    return Response.json(
      { ok: false, reason: "rate_limited", retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    );
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const result = await ingestInbound({
      userId,
      raw: {
        source: "sms",
        fromAddress: parsed.sender ?? null,
        subject: null,
        body: parsed.body,
        receivedAt: parsed.receivedAt ? new Date(parsed.receivedAt) : new Date(),
      },
    });
    return Response.json({ ok: true, id: result.id, status: result.status });
  } catch (err) {
    logger.error({ err, userId }, "inbound sms ingest failed");
    return Response.json({ ok: false, reason: "ingest_failed" }, { status: 500 });
  }
}
