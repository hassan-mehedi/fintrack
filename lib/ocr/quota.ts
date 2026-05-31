import { db } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { startOfMonth } from "date-fns";

export const VERYFI_MONTHLY_FREE_QUOTA = 100;

/**
 * How many Veryfi-processed attachments did this user create in the current
 * UTC month? Used to decide whether the next OCR job should go to Veryfi
 * or fall back to Tesseract (client-side).
 */
export async function veryfiUsageThisMonth(userId: string): Promise<number> {
  const monthStart = startOfMonth(new Date());
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(attachments)
    .where(
      and(
        eq(attachments.userId, userId),
        eq(attachments.ocrProvider, "veryfi"),
        gte(attachments.createdAt, monthStart),
      ),
    );
  return Number(row?.count ?? 0);
}

/**
 * Returns which provider to use for the next OCR job. `veryfi` while the
 * monthly free quota holds; `tesseract` after that (client runs it in-browser).
 */
export async function pickOcrProvider(userId: string): Promise<"veryfi" | "tesseract"> {
  const used = await veryfiUsageThisMonth(userId);
  return used < VERYFI_MONTHLY_FREE_QUOTA ? "veryfi" : "tesseract";
}
