"use server";

import { db } from "@/lib/db";
import { attachments, transactions } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { and, eq, desc } from "drizzle-orm";
import { deleteObject, getSignedGetObjectUrl } from "@/lib/storage/r2";
import { recordChange } from "@/lib/audit-entity";

export async function getAttachmentsForTransaction(transactionId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  // verify ownership of the transaction
  const [txn] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(eq(transactions.id, transactionId), eq(transactions.userId, session.user.id)),
    )
    .limit(1);
  if (!txn) throw new Error("Transaction not found");

  const rows = await db
    .select({
      id: attachments.id,
      filename: attachments.filename,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
      ocrStatus: attachments.ocrStatus,
      ocrProvider: attachments.ocrProvider,
      ocrData: attachments.ocrData,
      kind: attachments.kind,
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .where(
      and(
        eq(attachments.userId, session.user.id),
        eq(attachments.ownerType, "transaction"),
        eq(attachments.ownerId, transactionId),
      ),
    )
    .orderBy(desc(attachments.createdAt));
  return rows;
}

export async function getAttachmentViewUrl(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [row] = await db
    .select({ storageKey: attachments.storageKey })
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, session.user.id)))
    .limit(1);
  if (!row) throw new Error("Attachment not found");
  return getSignedGetObjectUrl(row.storageKey, 300);
}

export async function deleteAttachment(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [row] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, session.user.id)))
    .limit(1);
  if (!row) throw new Error("Attachment not found");

  try {
    await deleteObject(row.storageKey);
  } catch {
    // R2 delete failed — still remove the DB row to avoid orphaned UI.
    // The object will eventually be GC'd by an out-of-band sweeper.
  }

  await db.delete(attachments).where(eq(attachments.id, id));

  await recordChange({
    ctx: { userId: session.user.id },
    entity: "transaction",
    entityId: row.ownerId,
    action: "update",
    before: { attachment: row.id, filename: row.filename },
    after: { attachment: null },
  });
}
