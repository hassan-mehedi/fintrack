import { auth } from "@/lib/auth";
import { attachmentSignLimiter } from "@/lib/rate-limit";
import { buildStorageKey, getSignedPutUrl } from "@/lib/storage/r2";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  kind: z.enum(["receipt", "statement", "note", "other"]).default("receipt"),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const limit = await attachmentSignLimiter(session.user.id);
  if (!limit.success) {
    return Response.json(
      { error: "Rate limit exceeded", retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    );
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(parsed.mimeType)) {
    return Response.json({ error: "Unsupported mime type" }, { status: 415 });
  }
  if (parsed.sizeBytes > MAX_SIZE) {
    return Response.json({ error: "File too large (max 10MB)" }, { status: 413 });
  }

  const uuid = randomUUID();
  const storageKey = buildStorageKey({
    userId: session.user.id,
    kind: parsed.kind,
    filename: parsed.filename,
    uuid,
  });

  try {
    const url = await getSignedPutUrl({
      key: storageKey,
      contentType: parsed.mimeType,
      contentLengthMax: parsed.sizeBytes,
      ttlSeconds: 300,
    });
    return Response.json({ url, storageKey, uuid });
  } catch (err) {
    logger.error({ err }, "presigned PUT URL generation failed");
    return Response.json({ error: "Could not generate upload URL" }, { status: 500 });
  }
}
