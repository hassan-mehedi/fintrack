import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { attachments, transactions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { attachmentFinalizeLimiter } from "@/lib/rate-limit";
import { deleteObject, getObjectBytes } from "@/lib/storage/r2";
import { pickOcrProvider } from "@/lib/ocr/quota";
import { parseVeryfi, processDocument } from "@/lib/ocr/veryfi";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  storageKey: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  ownerType: z.literal("transaction"),
  ownerId: z.string().uuid(),
  kind: z.enum(["receipt", "statement", "note", "other"]).default("receipt"),
  runOcr: z.boolean().default(true),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const limit = await attachmentFinalizeLimiter(session.user.id);
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

  // verify owner transaction belongs to this user
  const [txn] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(eq(transactions.id, parsed.ownerId), eq(transactions.userId, session.user.id)),
    )
    .limit(1);
  if (!txn) {
    // best-effort cleanup of the orphan upload
    await deleteObject(parsed.storageKey).catch(() => {});
    return Response.json({ error: "Owner transaction not found" }, { status: 404 });
  }

  // fetch the object to hash it + pass to OCR
  let bytes: Uint8Array;
  try {
    bytes = await getObjectBytes(parsed.storageKey);
  } catch (err) {
    logger.error({ err, key: parsed.storageKey }, "could not fetch uploaded object");
    return Response.json({ error: "Upload not found in storage" }, { status: 404 });
  }
  if (bytes.byteLength !== parsed.sizeBytes) {
    logger.warn(
      { reported: parsed.sizeBytes, actual: bytes.byteLength },
      "size mismatch between sign and finalize",
    );
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");

  // dedupe: if user already has an attachment with this hash, point to it
  // and delete the new R2 object.
  const [existing] = await db
    .select({ id: attachments.id, storageKey: attachments.storageKey })
    .from(attachments)
    .where(and(eq(attachments.userId, session.user.id), eq(attachments.sha256, sha256)))
    .limit(1);
  if (existing) {
    if (existing.storageKey !== parsed.storageKey) {
      await deleteObject(parsed.storageKey).catch(() => {});
    }
    return Response.json({ id: existing.id, deduped: true });
  }

  // decide provider before insert so we can record it
  const provider = parsed.runOcr ? await pickOcrProvider(session.user.id) : "none";

  const [row] = await db
    .insert(attachments)
    .values({
      userId: session.user.id,
      ownerType: parsed.ownerType,
      ownerId: parsed.ownerId,
      kind: parsed.kind,
      filename: parsed.filename,
      mimeType: parsed.mimeType,
      sizeBytes: bytes.byteLength,
      storageKey: parsed.storageKey,
      sha256,
      ocrStatus: parsed.runOcr ? (provider === "veryfi" ? "running" : "pending") : "skipped",
      ocrProvider: provider,
    })
    .returning();

  if (parsed.runOcr && provider === "veryfi") {
    try {
      const raw = await processDocument({
        fileBytes: bytes,
        filename: parsed.filename,
      });
      const parsedReceipt = parseVeryfi(raw);
      await db
        .update(attachments)
        .set({
          ocrStatus: "done",
          ocrText: raw.ocr_text ?? null,
          ocrData: parsedReceipt as unknown as Record<string, unknown>,
        })
        .where(eq(attachments.id, row.id));
      return Response.json({
        id: row.id,
        provider: "veryfi",
        ocr: parsedReceipt,
      });
    } catch (err) {
      logger.error({ err, attachmentId: row.id }, "veryfi processing failed");
      await db
        .update(attachments)
        .set({ ocrStatus: "failed" })
        .where(eq(attachments.id, row.id));
      // signal the client to fall back to Tesseract
      return Response.json({
        id: row.id,
        provider: "tesseract",
        ocr: null,
        fallbackReason: "veryfi_failed",
      });
    }
  }

  // Quota exhausted or runOcr=false → client should run Tesseract (or skip).
  return Response.json({
    id: row.id,
    provider,
    ocr: null,
  });
}
