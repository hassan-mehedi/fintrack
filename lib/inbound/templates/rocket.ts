import type { InboundTemplate, ParsedTransaction, RawInbound } from "../types";
import { parseBdtAmount, parseBdtDate, todayIso } from "../types";

/**
 * DBBL Rocket SMS templates. Sender id "DBBL" or "ROCKET".
 *
 * Examples:
 *   "Bal: TK 1,234.56. Cash Out: TK 100.00 to 01XX. Chrg: TK 1.85.
 *    TxnId: A1B2C3D4. 12-Mar-2024 14:30"
 *   "Bal: TK 5,000. Cash In: TK 500 from 01XX. TxnId: ..."
 *   "Payment: TK 250 to MERCHANT. Bal: TK 4,750. TxnId: ..."
 */
const ROCKET_SENDERS = ["dbbl", "rocket", "dbblrocket"];

export const rocketSmsTemplate: InboundTemplate = {
  id: "rocket.sms.v1",
  matches(raw) {
    if (raw.source !== "sms") return false;
    const from = (raw.fromAddress ?? "").toLowerCase();
    if (ROCKET_SENDERS.some((s) => from.includes(s))) return true;
    return /\bTxnId\b/i.test(raw.body) && /\bBal\b/i.test(raw.body);
  },
  parse(raw) {
    const body = raw.body.replace(/\s+/g, " ").trim();

    let direction: "in" | "out" | null = null;
    if (/\b(?:Cash\s*Out|Payment|Bill\s*Pay|Send\s*Money)\b/i.test(body)) direction = "out";
    else if (/\b(?:Cash\s*In|Add\s*Money|received)\b/i.test(body)) direction = "in";
    if (!direction) return null;

    const amtMatch =
      body.match(/(?:Cash\s*Out|Cash\s*In|Payment|Bill\s*Pay|Send\s*Money|Add\s*Money)\s*[:\s]*TK\.?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    if (!amtMatch) return null;
    const amount = parseBdtAmount(amtMatch[1]);
    if (!Number.isFinite(amount)) return null;

    const refMatch = body.match(/TxnId\s*[:\s]*([A-Z0-9]{4,})/i);
    const balMatch = body.match(/Bal\s*[:\s]*TK\.?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const feeMatch = body.match(/Chrg\s*[:\s]*TK\.?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const dateMatch = body.match(/(\d{1,2}-[A-Za-z]{3}-\d{4})/);
    const counterpartyMatch =
      body.match(/to\s+([A-Z0-9][A-Z0-9 &.,'\-]+?)(?:\.|\s+(?:Chrg|TxnId|Bal))/i) ||
      body.match(/from\s+([A-Z0-9][A-Z0-9 &.,'\-]+?)(?:\.|\s+(?:Chrg|TxnId|Bal))/i);

    const parsed: ParsedTransaction = {
      amount,
      fee: feeMatch ? parseBdtAmount(feeMatch[1]) : 0,
      direction,
      currency: "BDT",
      date: (dateMatch && parseBdtDate(dateMatch[1])) || todayIso(raw.receivedAt),
      merchant: counterpartyMatch ? counterpartyMatch[1].trim() : null,
      refId: refMatch ? refMatch[1] : null,
      balanceAfter: balMatch ? parseBdtAmount(balMatch[1]) : null,
      accountHint: "rocket",
      description: refMatch ? `Rocket ${refMatch[1]}` : "Rocket transaction",
    };
    return parsed;
  },
};
