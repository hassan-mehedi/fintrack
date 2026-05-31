import webpush from "web-push";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "@/lib/logger";

/**
 * Web Push wrapper. Free, no third-party vendor — uses the W3C Push API
 * with self-generated VAPID keys.
 *
 * Generate keys once:  npx web-push generate-vapid-keys
 * Then set:
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_CONTACT          (mailto:you@example.com — required by spec)
 *
 * The public key is also exposed to the browser via NEXT_PUBLIC_VAPID_PUBLIC_KEY.
 */

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const contact = process.env.VAPID_CONTACT;
  if (!pub || !priv || !contact) return false;
  webpush.setVapidDetails(contact, pub, priv);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  /** Deep link path opened when the user taps the notification. */
  url?: string;
  /** Stable id used by the SW to coalesce repeat notifications. */
  tag?: string;
  /** Arbitrary payload available to the SW click handler. */
  data?: Record<string, unknown>;
};

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) {
    logger.debug({ userId }, "web-push not configured; skipping");
    return;
  }

  const subs = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        isNull(pushSubscriptions.revokedAt),
      ),
    );

  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  const stale: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        await db
          .update(pushSubscriptions)
          .set({ lastUsedAt: new Date() })
          .where(eq(pushSubscriptions.id, s.id));
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription has expired or been revoked at the browser — remove it.
          stale.push(s.id);
        } else {
          logger.warn({ err, userId, subId: s.id }, "web-push send failed");
        }
      }
    }),
  );

  if (stale.length) {
    await db
      .update(pushSubscriptions)
      .set({ revokedAt: new Date() })
      .where(eq(pushSubscriptions.id, stale[0]));
    // Drizzle's eq doesn't support arrays directly here; do the rest in a loop.
    for (let i = 1; i < stale.length; i++) {
      await db
        .update(pushSubscriptions)
        .set({ revokedAt: new Date() })
        .where(eq(pushSubscriptions.id, stale[i]));
    }
  }
}
