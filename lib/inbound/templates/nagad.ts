import type { InboundTemplate, ParsedTransaction, RawInbound } from "../types";
import { parseBdtAmount, parseBdtDate, todayIso } from "../types";

/**
 * Nagad SMS templates. Sender id is typically "NAGAD" or "NAGAD-OTP".
 *
 * Example bodies:
 *   "Nagad: Send Money TK 1,000 to 01XXXXXXXXX successful. TxnID: NX1234567"
 *   "Nagad: Cash In TK 5,000 from agent 01XXXXXXXXX. Balance TK 12,345.50.
 *    TxnID: NX2345678"
 *   "Nagad: Bill Pay TK 350 to <Biller>. TxnID: NX..."
 *   "Nagad: Payment TK 199 to <Merchant>. Balance TK ..."
 */
const NAGAD_SENDERS = ["nagad"];

function senderLooksLikeNagad(raw: RawInbound): boolean {
  const from = (raw.fromAddress ?? "").toLowerCase();
  return NAGAD_SENDERS.some((s) => from === s || from.includes(s)) || from.endsWith("@nagad.com.bd");
}

function decideDirection(body: string): "in" | "out" | null {
  if (/\b(?:Send\s*Money|Payment|Bill\s*Pay|Cash\s*Out|Pay\s*Bill)\b/i.test(body)) return "out";
  if (/\b(?:Cash\s*In|Add\s*Money|received|Received)\b/i.test(body)) return "in";
  return null;
}

export const nagadSmsTemplate: InboundTemplate = {
  id: "nagad.sms.v1",
  matches(raw) {
    if (raw.source !== "sms") return false;
    if (senderLooksLikeNagad(raw)) return true;
    return /\bnagad\b/i.test(raw.body) && /\bTxnID\b/i.test(raw.body);
  },
  parse(raw) {
    const body = raw.body.replace(/\s+/g, " ").trim();
    const direction = decideDirection(body);
    const amountMatch = body.match(/TK\.?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    if (!direction || !amountMatch) return null;
    const amount = parseBdtAmount(amountMatch[1]);
    if (!Number.isFinite(amount)) return null;

    const refMatch = body.match(/Txn(?:Id|ID)\s*[:\s]*([A-Z0-9]{6,})/i);
    const balMatch = body.match(/Balance\s*TK\.?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const feeMatch = body.match(/(?:Fee|Charge)\s*TK\.?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const counterpartyMatch =
      body.match(/to\s+([A-Z0-9][A-Z0-9 &.,'\-]+?)(?:\.|\s+TxnID)/i) ||
      body.match(/from\s+(?:agent\s+)?([A-Z0-9][A-Z0-9 &.,'\-]+?)(?:\.|\s+TxnID)/i);
    const dateMatch = body.match(/(?:at|on)\s+(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2})?)/i);

    const parsed: ParsedTransaction = {
      amount,
      fee: feeMatch ? parseBdtAmount(feeMatch[1]) : 0,
      direction,
      currency: "BDT",
      date: (dateMatch && parseBdtDate(dateMatch[1])) || todayIso(raw.receivedAt),
      merchant: counterpartyMatch ? counterpartyMatch[1].trim() : null,
      refId: refMatch ? refMatch[1] : null,
      balanceAfter: balMatch ? parseBdtAmount(balMatch[1]) : null,
      accountHint: "nagad",
      description: refMatch ? `Nagad ${refMatch[1]}` : "Nagad transaction",
    };
    return parsed;
  },
};
