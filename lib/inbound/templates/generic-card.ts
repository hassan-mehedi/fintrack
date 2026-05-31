import type { InboundTemplate, ParsedTransaction, RawInbound } from "../types";
import { parseBdtAmount, parseBdtDate, todayIso } from "../types";

/**
 * A fall-through template for generic "card transaction alert" SMS/email
 * messages that the bank-specific templates didn't claim. Lower confidence
 * than the specific ones — the pipeline only consults it after the named
 * templates miss.
 *
 * Triggers on any message that mentions "card" + an amount + a merchant.
 */
export const genericCardAlertTemplate: InboundTemplate = {
  id: "generic.card.v1",
  matches(raw) {
    const body = raw.body;
    if (!/\b(?:card|debit|credit)\b/i.test(body)) return false;
    if (!/(?:BDT|TK|Tk\.?|USD|EUR)\s*[0-9]/.test(body)) return false;
    return /\b(?:at|to|from)\s+[A-Z]/.test(body);
  },
  parse(raw) {
    const body = raw.body.replace(/\s+/g, " ").trim();

    const debit = /\b(?:debit(?:ed)?|spent|purchase[ds]?|charge[ds]?|withdraw(?:n|al)?|paid|payment)\b/i.test(body);
    const credit = /\b(?:credit(?:ed)?|deposit(?:ed)?|received|refund(?:ed)?)\b/i.test(body);
    if (!debit && !credit) return null;
    const direction: "in" | "out" = debit ? "out" : "in";

    const amountMatch =
      body.match(/(?:BDT|TK|Tk\.?)\s*([0-9,]+(?:\.\d{1,2})?)/i) ||
      body.match(/(USD|EUR|GBP|INR)\s*([0-9,]+(?:\.\d{1,2})?)/i);
    if (!amountMatch) return null;
    const currencyMatch = body.match(/\b(BDT|USD|EUR|GBP|INR)\b/i);
    const currency = currencyMatch ? currencyMatch[1].toUpperCase() : "BDT";
    const amount = parseBdtAmount(amountMatch[amountMatch.length - 1]);
    if (!Number.isFinite(amount)) return null;

    const merchantMatch = body.match(/(?:at|to|from)\s+([A-Z0-9][A-Z0-9 &.,'\-/]{2,40}?)(?:\s+(?:on|for|at|.{0,12}\d)|[,.])/);
    const refMatch = body.match(/(?:Ref(?:erence)?|TrxID|Txn(?:Id|ID))\s*[:\s]*([A-Z0-9]{4,})/i);
    const balMatch = body.match(/(?:Bal(?:ance)?)\s*[:\s]*[A-Z]{0,3}\.?\s*([0-9,]+(?:\.\d{1,2})?)/i);
    const dateMatch = body.match(/(\d{1,2}[-/][A-Za-z]{3,}[-/]\d{4})|(\d{4}-\d{2}-\d{2})|(\d{1,2}\/\d{1,2}\/\d{4})/);
    const cardMatch = body.match(/(?:card|account)\s+(?:ending\s+|number\s+)?[X*]*\s*(\d{4})/i);

    return {
      amount,
      fee: 0,
      direction,
      currency,
      date: (dateMatch && parseBdtDate(dateMatch[0])) || todayIso(raw.receivedAt),
      merchant: merchantMatch ? merchantMatch[1].trim() : null,
      refId: refMatch ? refMatch[1] : null,
      balanceAfter: balMatch ? parseBdtAmount(balMatch[1]) : null,
      accountHint: cardMatch ? `card-${cardMatch[1]}` : null,
      description: merchantMatch ? merchantMatch[1].trim() : "Card transaction",
    };
  },
};
