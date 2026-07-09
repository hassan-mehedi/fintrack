import type { InboundTemplate } from "../types";
import { parseBdtAmount, parseBdtDate, todayIso } from "../types";

/**
 * City Bank PLC transaction alert emails + SMS.
 *
 * Email example (subject-led):
 *   Subject: "Transaction Alert"
 *   Body:    "Dear Customer, your card ending 1234 has been used for
 *             BDT 2,500.00 at MERCHANT NAME on 12-Mar-2024 14:30.
 *             Available balance BDT 25,000.00. Ref: 9X8Y7Z6Q"
 *
 * SMS example:
 *   "Txn Alert: BDT 2,500 spent at MERCHANT on 12-Mar-2024 from card 1234.
 *    Bal: BDT 25,000. Ref: 9X8Y7"
 */
export const cityBankTemplate: InboundTemplate = {
  id: "citybank.v1",
  matches(raw) {
    const from = (raw.fromAddress ?? "").toLowerCase();
    if (
      from.endsWith("@thecitybank.com") ||
      from.endsWith("@citybank.com.bd") ||
      from.includes("citybank")
    )
      return true;
    return /\bCity\s*Bank\b/i.test(raw.body) && /\b(?:ref|trxn|txn)\b/i.test(raw.body);
  },
  parse(raw) {
    const body = raw.body.replace(/\s+/g, " ").trim();

    let direction: "in" | "out" = "out";
    if (/\b(?:received|credit(?:ed)?|deposit(?:ed)?)\b/i.test(body)) direction = "in";

    const amountMatch =
      body.match(/BDT\.?\s*([0-9,]+(?:\.\d{1,2})?)/i) ||
      body.match(/Tk?\.?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    if (!amountMatch) return null;
    const amount = parseBdtAmount(amountMatch[1]);
    if (!Number.isFinite(amount)) return null;

    const merchantMatch = body.match(
      /(?:at|to)\s+([A-Z0-9][A-Z0-9 &.,'\-/]+?)(?:\s+on\s|\s+at\s|\.|,)/i,
    );
    const refMatch = body.match(/Ref(?:erence)?\s*[:\s]*([A-Z0-9]{4,})/i);
    const balMatch = body.match(/(?:Available\s+)?(?:Balance|Bal)\s*[:\s]*BDT\.?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const dateMatch = body.match(/on\s+(\d{1,2}-[A-Za-z]{3}-\d{4})/i);
    const cardMatch = body.match(/card\s+(?:ending\s+|number\s+)?(\d{4})/i);

    return {
      amount,
      fee: 0,
      direction,
      currency: "BDT",
      date: (dateMatch && parseBdtDate(dateMatch[1])) || todayIso(raw.receivedAt),
      merchant: merchantMatch ? merchantMatch[1].trim() : null,
      refId: refMatch ? refMatch[1] : null,
      balanceAfter: balMatch ? parseBdtAmount(balMatch[1]) : null,
      accountHint: cardMatch ? `citybank-${cardMatch[1]}` : "citybank",
      description: merchantMatch ? merchantMatch[1].trim() : "City Bank transaction",
    };
  },
};
