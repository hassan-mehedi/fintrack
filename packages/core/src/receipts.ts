import { randomUUID } from "node:crypto";
import { db } from "@fintrack/db";
import { transactions } from "@fintrack/db/schema";
import { and, eq } from "drizzle-orm";
import { NotFoundError, ValidationError } from "./errors";
import { deleteObject, getSignedDownloadUrl, putObject } from "./storage";

const EXTENSION_BY_MIME: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "application/pdf": "pdf",
};

export const RECEIPT_ACCEPTED_MIMES = Object.keys(EXTENSION_BY_MIME);
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

export interface ReceiptFile {
    name: string;
    mime: string;
    bytes: Uint8Array;
}

async function getOwnedTransaction(userId: string, transactionId: string) {
    const [txn] = await db
        .select({
            id: transactions.id,
            receiptKey: transactions.receiptKey,
            receiptName: transactions.receiptName,
            receiptMime: transactions.receiptMime,
        })
        .from(transactions)
        .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)))
        .limit(1);
    if (!txn) throw new NotFoundError("Transaction not found");
    return txn;
}

export async function attachReceipt(userId: string, transactionId: string, file: ReceiptFile) {
    const extension = EXTENSION_BY_MIME[file.mime];
    if (!extension) {
        throw new ValidationError("Receipts must be a JPEG, PNG, WebP, HEIC or PDF file");
    }
    if (file.bytes.byteLength === 0) throw new ValidationError("The file is empty");
    if (file.bytes.byteLength > RECEIPT_MAX_BYTES) {
        throw new ValidationError("Receipts must be 5 MB or smaller");
    }

    const txn = await getOwnedTransaction(userId, transactionId);
    const key = `receipts/${userId}/${transactionId}/${randomUUID()}.${extension}`;
    const name = file.name.trim() || `receipt.${extension}`;

    await putObject(key, file.bytes, file.mime);
    await db
        .update(transactions)
        .set({ receiptKey: key, receiptName: name, receiptMime: file.mime, updatedAt: new Date() })
        .where(eq(transactions.id, transactionId));

    // The row already points at the new object, so losing this delete only leaves an orphan
    if (txn.receiptKey) await deleteObject(txn.receiptKey);

    return { receiptKey: key, receiptName: name, receiptMime: file.mime };
}

export async function removeReceipt(userId: string, transactionId: string) {
    const txn = await getOwnedTransaction(userId, transactionId);
    if (!txn.receiptKey) return;

    await db
        .update(transactions)
        .set({ receiptKey: null, receiptName: null, receiptMime: null, updatedAt: new Date() })
        .where(eq(transactions.id, transactionId));
    await deleteObject(txn.receiptKey);
}

export async function getReceiptUrl(userId: string, transactionId: string) {
    const txn = await getOwnedTransaction(userId, transactionId);
    if (!txn.receiptKey) throw new NotFoundError("No receipt attached");

    return {
        url: await getSignedDownloadUrl(txn.receiptKey),
        name: txn.receiptName,
        mime: txn.receiptMime,
    };
}
