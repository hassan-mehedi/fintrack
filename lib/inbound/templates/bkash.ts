import type { InboundTemplate, ParsedTransaction, RawInbound } from "../types";
import { parseBdtAmount, parseBdtDate, todayIso } from "../types";

/**
 * bKash SMS templates. Senders typically come from the short code "bKash"
 * (alphanumeric sender id) regardless of carrier.
 *
 * Patterns observed in production messages (2023–2025):
 *
 *   SEND MONEY (out):
 *     "Send Money Tk 1,000.00 to 017XXXXXXXX successful.
 *      Fee Tk 5.00. Balance Tk 4,000.00. TrxID 8XY4Z5Q at 12/03/2024 14:30"
 *
 *   RECEIVE / CASH IN (in):
 *     "Cash In Tk 5,000.00 from agent 01XXXXXXXXX successful.
 *      Available Balance: Tk 12,345.67. TrxID 8X4Y5Z6Q7 at 12/03/2024 14:22"
 *     "You have received Tk 500.00 from 017XXXXXXXX. Available Balance Tk ..."
 *
 *   PAYMENT (out, merchant):
 *     "Your Payment Tk 500.00 to MERCHANT NAME is successful.
 *      Available Balance Tk 4,500.00. TrxID 1A2B3C4D5 at ..."
 *
 *   CASH OUT (out):
 *     "Cash Out Tk 2,000.00 from agent 01XXXXXXXXX successful.
 *      Fee Tk 37.00. Balance Tk 1,960.00. TrxID ... at ..."
 *
 *   PAYMENT BILL (out):
 *     "Bill Pay Tk 350.00 to <biller> successful. ..."
 */
const BKASH_SENDERS = ["bkash", "bkashltd"];

function senderLooksLikeBkash(raw: RawInbound): boolean {
  const from = (raw.fromAddress ?? "").toLowerCase();
  if (BKASH_SENDERS.some((s) => from === s || from.includes(s))) return true;
  // sometimes the sender is the e-mail "no-reply@bkash.com"
  return from.endsWith("@bkash.com");
}

function bodyLooksLikeBkash(raw: RawInbound): boolean {
  return /\bbkash\b/i.test(raw.body) || /\bTrxID\s*[:\s]/i.test(raw.body);
}

function pickDate(body: string, raw: RawInbound): string {
  // "at DD/MM/YYYY HH:MM" or "on YYYY-MM-DD HH:MM"
  const m =
    body.match(/(?:at|on)\s+(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2})?)/i) ||
    body.match(/(?:at|on)\s+(\d{4}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?)/i);
  if (m) {
    const d = parseBdtDate(m[1]);
    if (d) return d;
  }
  return todayIso(raw.receivedAt);
}

function pickRefId(body: string): string | null {
  const m = body.match(/TrxID\s*[:\s]*([A-Z0-9]{6,})/i);
  return m ? m[1] : null;
}

function pickBalance(body: string): number | null {
  const m = body.match(/(?:Available\s+)?Balance\s*[:\s]*Tk?\.?\s*([0-9,]+(?:\.\d{1,2})?)/i);
  if (!m) return null;
  const v = parseBdtAmount(m[1]);
  return Number.isFinite(v) ? v : null;
}

function pickFee(body: string): number {
  const m = body.match(/(?:Fee|Chrg|Charge)\s*[:\s]*Tk?\.?\s*([0-9,]+(?:\.\d{1,2})?)/i);
  if (!m) return 0;
  const v = parseBdtAmount(m[1]);
  return Number.isFinite(v) ? v : 0;
}

function pickAmount(body: string): number {
  // Take the first "Tk <amount>" after one of the action keywords.
  const m = body.match(
    /(Send\s*Money|Cash\s*In|Cash\s*Out|Payment|Bill\s*Pay|Add\s*Money|received)\D{1,30}Tk?\.?\s*([0-9,]+(?:\.\d{1,2})?)/i,
  );
  if (m) return parseBdtAmount(m[2]);
  // Fallback: first Tk amount in the message.
  const fallback = body.match(/Tk?\.?\s*([0-9,]+(?:\.\d{1,2})?)/i);
  return fallback ? parseBdtAmount(fallback[1]) : NaN;
}

function pickCounterparty(body: string): string | null {
  // "to <name>" or "from <name>" — name can be a phone or a merchant string.
  const to = body.match(/to\s+([A-Z0-9][A-Z0-9 &.,'\-]+?)(?:\s+(?:is\s+successful|successful|\.|TrxID))/i);
  if (to) return to[1].trim().replace(/\s+/g, " ");
  const from = body.match(/from\s+(?:agent\s+)?([A-Z0-9][A-Z0-9 &.,'\-]+?)(?:\s+successful|\.|TrxID)/i);
  if (from) return from[1].trim().replace(/\s+/g, " ");
  // Phone-number-only counterparties
  const phone = body.match(/\b(01\d{9})\b/);
  return phone ? phone[1] : null;
}

function decideDirection(body: string): "in" | "out" | null {
  if (/\b(?:Send\s*Money|Payment|Cash\s*Out|Bill\s*Pay|Pay\s*Bill)\b/i.test(body)) return "out";
  if (/\b(?:Cash\s*In|Add\s*Money|received|Received)\b/i.test(body)) return "in";
  return null;
}

export const bkashSmsTemplate: InboundTemplate = {
  id: "bkash.sms.v1",
  matches(raw) {
    if (raw.source !== "sms") return false;
    if (senderLooksLikeBkash(raw)) return true;
    return bodyLooksLikeBkash(raw);
  },
  parse(raw) {
    const body = raw.body.replace(/\s+/g, " ").trim();
    const direction = decideDirection(body);
    const amount = pickAmount(body);
    if (!direction || !Number.isFinite(amount)) return null;

    const merchant = pickCounterparty(body);
    const refId = pickRefId(body);
    const balanceAfter = pickBalance(body);
    const fee = pickFee(body);
    const date = pickDate(body, raw);

    const parsed: ParsedTransaction = {
      amount,
      fee,
      direction,
      currency: "BDT",
      date,
      merchant,
      refId,
      balanceAfter,
      accountHint: "bkash",
      description: refId ? `bKash ${refId}` : "bKash transaction",
    };
    return parsed;
  },
};
