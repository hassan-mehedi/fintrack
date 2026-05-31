import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { deleteObject, getSignedGetObjectUrl } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;

  const [row] = await db
    .select({
      id: attachments.id,
      storageKey: attachments.storageKey,
      filename: attachments.filename,
      mimeType: attachments.mimeType,
      ocrStatus: attachments.ocrStatus,
      ocrProvider: attachments.ocrProvider,
      ocrData: attachments.ocrData,
    })
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, session.user.id)))
    .limit(1);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  const url = await getSignedGetObjectUrl(row.storageKey, 300);
  return Response.json({
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    ocrStatus: row.ocrStatus,
    ocrProvider: row.ocrProvider,
    ocrData: row.ocrData,
    url,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;

  const [row] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, session.user.id)))
    .limit(1);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  await deleteObject(row.storageKey).catch(() => {});
  await db.delete(attachments).where(eq(attachments.id, id));

  return Response.json({ ok: true });
}
