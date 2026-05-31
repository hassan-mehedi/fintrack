import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  ocrText: z.string().max(50_000),
  ocrData: z
    .object({
      amount: z.number().nullable().optional(),
      date: z.string().nullable().optional(),
      merchantName: z.string().nullable().optional(),
      currency: z.string().nullable().optional(),
      lineItems: z
        .array(
          z.object({
            description: z.string(),
            quantity: z.number().nullable().optional(),
            total: z.number().nullable().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

/**
 * Accepts a Tesseract.js result computed in the user's browser. Used when
 * the Veryfi monthly quota is exhausted (or Veryfi itself failed).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;

  const [row] = await db
    .select({ id: attachments.id, userId: attachments.userId })
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, session.user.id)))
    .limit(1);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  await db
    .update(attachments)
    .set({
      ocrStatus: "done",
      ocrText: parsed.ocrText,
      ocrData: (parsed.ocrData ?? null) as unknown as Record<string, unknown> | null,
      ocrProvider: "tesseract",
    })
    .where(eq(attachments.id, id));

  return Response.json({ ok: true });
}
