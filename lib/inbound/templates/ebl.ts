import type { InboundTemplate } from "../types";
import { parseBdtAmount, parseBdtDate, todayIso } from "../types";

/**
 * Eastern Bank PLC (EBL) transaction alert emails + SMS.
 *
 * Subject often: "EBL Transaction Alert" / "EBL Skybanking Alert"
 *
 * Example: "Dear Customer, Your A/C XXX0987 has been debited BDT 1,234.56 on
 *           12-MAR-2024 for POS Purchase at MERCHANT NAME. Available Balance:
 *           BDT 25,000.00. Ref: 9X8Y7Z."
 */
export const eblTemplate: InboundTemplate = {
  id: "ebl.v1",
  matches(raw) {
    const from = (raw.fromAddress ?? "").toLowerCase();
    if (from.endsWith("@ebl.com.bd") || from.includes("easternbank") || from.includes("ebl")) return true;
    return /\bEastern\s*Bank\b/i.test(raw.body) || /\bEBL\b/.test(raw.body);
  },
  parse(raw) {
    const body = raw.body.replace(/\s+/g, " ").trim();
    const debit = /\b(?:debited|debit)\b/i.test(body);
    const credit = /\b(?:credited|credit(?:ed)?)\b/i.test(body);
    if (!debit && !credit) return null;
    const direction: "in" | "out" = debit ? "out" : "in";

    const amtMatch = body.match(/BDT\.?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    if (!amtMatch) return null;
    const amount = parseBdtAmount(amtMatch[1]);
    if (!Number.isFinite(amount)) return null;

    const refMatch = body.match(/Ref(?:erence)?\s*[:\s]*([A-Z0-9]{4,})/i);
    const balMatch = body.match(/(?:Available\s+)?Balance\s*[:\s]*BDT\.?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const merchantMatch = body.match(/at\s+([A-Z0-9][A-Z0-9 &.,'\-/]+?)(?:\.|,|\s+(?:Ref|Available))/i);
    const acctMatch = body.match(/A\/?C\s+([X*]+\d{3,}|\d{3,})/i);
    const dateMatch = body.match(/on\s+(\d{1,2}-[A-Za-z]{3}-\d{4})/i);

    return {
      amount,
      fee: 0,
      direction,
      currency: "BDT",
      date: (dateMatch && parseBdtDate(dateMatch[1])) || todayIso(raw.receivedAt),
      merchant: merchantMatch ? merchantMatch[1].trim() : null,
      refId: refMatch ? refMatch[1] : null,
      balanceAfter: balMatch ? parseBdtAmount(balMatch[1]) : null,
      accountHint: acctMatch ? `ebl-${acctMatch[1]}` : "ebl",
      description: merchantMatch ? merchantMatch[1].trim() : "EBL transaction",
    };
  },
};
