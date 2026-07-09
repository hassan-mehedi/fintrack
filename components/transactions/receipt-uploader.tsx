"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Paperclip, Trash2, Wand2 } from "lucide-react";
import { getAttachmentsForTransaction, deleteAttachment } from "@/lib/actions/attachments";

const MAX_SIZE = 10 * 1024 * 1024;
const ACCEPTED = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

export type OcrFields = {
  amount?: number | null;
  date?: string | null;
  merchantName?: string | null;
  currency?: string | null;
  /** Veryfi-shaped line items used to pre-fill a split when ≥2 exist. */
  lineItems?: Array<{
    description: string;
    quantity?: number | null;
    total: number | null;
  }>;
};

interface ReceiptUploaderProps {
  transactionId: string;
  onApplyOcr?: (ocr: OcrFields) => void;
}

type AttachmentRow = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  ocrStatus: "pending" | "running" | "done" | "failed" | "skipped";
  ocrProvider: "veryfi" | "tesseract" | "none";
  ocrData: unknown;
  createdAt: Date;
};

export function ReceiptUploader({ transactionId, onApplyOcr }: ReceiptUploaderProps) {
  const [rows, setRows] = useState<AttachmentRow[]>([]);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = (await getAttachmentsForTransaction(transactionId)) as AttachmentRow[];
      setRows(data);
    } catch {
      // unauthorized / missing — leave list empty
    }
  }, [transactionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleFile = async (file: File) => {
    if (file.size > MAX_SIZE) {
      toast.error("File too large (max 10 MB)");
      return;
    }
    setUploading(true);
    try {
      const signRes = await fetch("/api/attachments/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          kind: "receipt",
        }),
      });
      if (!signRes.ok) throw new Error("could not get upload URL");
      const { url, storageKey } = (await signRes.json()) as {
        url: string;
        storageKey: string;
      };

      const putRes = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("upload failed");

      const finalizeRes = await fetch("/api/attachments/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageKey,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          ownerType: "transaction",
          ownerId: transactionId,
          kind: "receipt",
        }),
      });
      if (!finalizeRes.ok) throw new Error("finalize failed");
      const final = (await finalizeRes.json()) as {
        id: string;
        provider: "veryfi" | "tesseract" | "none";
        ocr: OcrFields | null;
        deduped?: boolean;
      };

      if (final.deduped) {
        toast.info("Same receipt is already attached");
      } else {
        toast.success("Receipt attached");
      }

      // If Veryfi succeeded, offer to apply
      if (final.ocr && onApplyOcr) {
        // Surface the data inline instead of auto-applying.
      }

      if (final.provider === "tesseract" && !final.deduped) {
        // Run Tesseract in-browser and report back to the server.
        runTesseract(file, final.id).catch(() => {
          /* surfaced via toast already */
        });
      }

      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteAttachment(id);
      await refresh();
    } catch {
      toast.error("Could not delete attachment");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Receipts</label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
          <span>Attach receipt</span>
          <input
            type="file"
            accept={ACCEPTED}
            className="hidden"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No receipts attached yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const ocr = (r.ocrData ?? null) as OcrFields | null;
            return (
              <li
                key={r.id}
                className="flex items-start justify-between gap-2 rounded-md border p-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.filename}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.ocrStatus === "running" && "OCR running…"}
                    {r.ocrStatus === "pending" && "OCR pending (in-browser)…"}
                    {r.ocrStatus === "failed" && "OCR failed"}
                    {r.ocrStatus === "skipped" && "OCR skipped"}
                    {r.ocrStatus === "done" && ocr && (
                      <>
                        {ocr.merchantName && <span>{ocr.merchantName} · </span>}
                        {ocr.amount != null && <span>{ocr.amount} </span>}
                        {ocr.currency && <span>{ocr.currency} </span>}
                        {ocr.date && <span>· {ocr.date}</span>}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  {r.ocrStatus === "done" && ocr && onApplyOcr && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onApplyOcr(ocr)}
                      title="Apply OCR fields to this transaction"
                    >
                      <Wand2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(r.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Runs Tesseract.js in the browser as a fallback OCR provider when the
 * Veryfi monthly quota is exhausted. Posts the raw text back to the server.
 * Best-effort: structured field extraction is left to the LLM-search work
 * in a later phase; for now we send just the raw text.
 */
async function runTesseract(file: File, attachmentId: string): Promise<void> {
  let Tesseract: typeof import("tesseract.js");
  try {
    Tesseract = await import("tesseract.js");
  } catch {
    toast.warning("Local OCR unavailable. Receipt stored without text.");
    return;
  }

  if (file.type === "application/pdf") {
    toast.info("Stored. (Local OCR doesn't handle PDFs — upgrade Veryfi quota for that.)");
    return;
  }

  toast.info("Running OCR locally…");
  try {
    const result = await Tesseract.recognize(file, "eng");
    const text = result?.data?.text ?? "";
    await fetch(`/api/attachments/${attachmentId}/ocr-result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ocrText: text }),
    });
    toast.success("OCR complete");
  } catch {
    toast.warning("Local OCR failed; receipt is still saved.");
  }
}
