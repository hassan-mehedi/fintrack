import type { InboundTemplate } from "../types";
import { parseBdtAmount, parseBdtDate, todayIso } from "../types";

/**
 * Upay (UCB) SMS templates. Sender ids include "UPAY", "UCB-Upay".
 *
 * Examples:
 *   "Upay: Send Money BDT 1,000.00 to 017XXXXXXXX. Bal: BDT 4,000.00.
 *    TxID UPAY12345 at 12/03/2024 14:30"
 *   "Upay: You have received BDT 500 from 017XXX. Bal: BDT 4,500. TxID ..."
 */
export const upaySmsTemplate: InboundTemplate = {
  id: "upay.sms.v1",
  matches(raw) {
    if (raw.source !== "sms") return false;
    const from = (raw.fromAddress ?? "").toLowerCase();
    if (from.includes("upay")) return true;
    return /\bUpay\b/i.test(raw.body);
  },
  parse(raw) {
    const body = raw.body.replace(/\s+/g, " ").trim();
    let direction: "in" | "out" | null = null;
    if (/\b(?:Send\s*Money|Payment|Cash\s*Out|Bill\s*Pay)\b/i.test(body)) direction = "out";
    else if (/\b(?:Cash\s*In|received|Add\s*Money)\b/i.test(body)) direction = "in";
    if (!direction) return null;

    const amtMatch = body.match(/BDT\s*([0-9,]+(?:\.\d{1,2})?)/i);
    if (!amtMatch) return null;
    const amount = parseBdtAmount(amtMatch[1]);
    if (!Number.isFinite(amount)) return null;

    const refMatch = body.match(/Tx(?:Id|ID)\s*[:\s]*([A-Z0-9]{4,})/i);
    const balMatch = body.match(/Bal\s*[:\s]*BDT\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const feeMatch = body.match(/(?:Fee|Charge|Chrg)\s*[:\s]*BDT\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const dateMatch = body.match(/(?:at|on)\s+(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2})?)/i);
    const counterpartyMatch =
      body.match(/to\s+([A-Z0-9][A-Z0-9 &.,'\-]+?)(?:\.|\s+(?:Tx|Bal))/i) ||
      body.match(/from\s+([A-Z0-9][A-Z0-9 &.,'\-]+?)(?:\.|\s+(?:Tx|Bal))/i);

    return {
      amount,
      fee: feeMatch ? parseBdtAmount(feeMatch[1]) : 0,
      direction,
      currency: "BDT",
      date: (dateMatch && parseBdtDate(dateMatch[1])) || todayIso(raw.receivedAt),
      merchant: counterpartyMatch ? counterpartyMatch[1].trim() : null,
      refId: refMatch ? refMatch[1] : null,
      balanceAfter: balMatch ? parseBdtAmount(balMatch[1]) : null,
      accountHint: "upay",
      description: refMatch ? `Upay ${refMatch[1]}` : "Upay transaction",
    };
  },
};
