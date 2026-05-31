import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  let parsed;
  try {
    parsed = subscribeSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  await db
    .insert(pushSubscriptions)
    .values({
      userId: session.user.id,
      endpoint: parsed.endpoint,
      p256dh: parsed.p256dh,
      auth: parsed.auth,
      userAgent: parsed.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: session.user.id,
        p256dh: parsed.p256dh,
        auth: parsed.auth,
        userAgent: parsed.userAgent ?? null,
        revokedAt: null,
      },
    });

  return Response.json({ ok: true });
}

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  let parsed;
  try {
    parsed = unsubscribeSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, session.user.id),
        eq(pushSubscriptions.endpoint, parsed.endpoint),
      ),
    );

  return Response.json({ ok: true });
}
