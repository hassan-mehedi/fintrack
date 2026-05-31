/**
 * Shared types for the inbound parsing pipeline.
 */

export type RawInbound = {
  source: "email" | "sms" | "statement_pdf";
  /** "From" address (email) or sender number/sender id (SMS). */
  fromAddress: string | null;
  /** Email subject. Always null for SMS. */
  subject: string | null;
  /** The message body — plain text where possible. */
  body: string;
  /** Provider-supplied received-at; falls back to now() if absent. */
  receivedAt: Date;
};

export type Direction = "in" | "out";

export type ParsedTransaction = {
  /** Money amount, always positive. */
  amount: number;
  /** Optional fee charged to the user. */
  fee: number;
  /** "in" = money to the user (income/refund), "out" = money from the user (expense). */
  direction: Direction;
  /** ISO 4217 if known; null lets the resolver pick based on accountHint. */
  currency: string | null;
  /** ISO yyyy-MM-dd. */
  date: string;
  /** Free-form merchant or counterparty name. */
  merchant: string | null;
  /** Provider's transaction id — used as transactions.externalId for dedupe. */
  refId: string | null;
  /** Balance the provider reports after this transaction, in account currency. */
  balanceAfter: number | null;
  /** Hint about which user account this maps to — e.g. "bkash", "nagad". */
  accountHint: string | null;
  /** Human-readable description used for transactions.description. */
  description: string;
};

export type TemplateResult = {
  templateId: string;
  parsed: ParsedTransaction;
  confidence: number;
};

export interface InboundTemplate {
  /** Stable identifier persisted on inbound_messages.templateId. */
  id: string;
  /**
   * Cheap discriminator — should be O(1). If true, the pipeline calls parse().
   */
  matches(raw: RawInbound): boolean;
  /**
   * Returns null if the message looks like it should match but the parse
   * failed (so the pipeline can fall back to LLM).
   */
  parse(raw: RawInbound): ParsedTransaction | null;
}

/**
 * Parses BD-style amount strings (e.g. "1,234.56", "Tk 250", "BDT 1500").
 * Returns NaN for unparseable input.
 */
export function parseBdtAmount(s: string): number {
  if (!s) return NaN;
  const cleaned = s.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Parses common BD date formats:
 *   "12/03/2024 14:22"  -> "2024-03-12"
 *   "12-Mar-2024"       -> "2024-03-12"
 *   "2024-03-12 14:22:00" -> "2024-03-12"
 * Returns null on failure; callers default to today.
 */
const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function parseBdtDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const trimmed = s.trim();

  // 2024-03-12 ...
  let m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // 12/03/2024  (DD/MM/YYYY — the BD convention)
  m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;

  // 12-03-2024
  m = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;

  // 12-Mar-2024 / 12 Mar 2024 / 12 March 2024
  m = trimmed.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s-]+(\d{4})/);
  if (m) {
    const monthKey = m[2].slice(0, 3).toLowerCase();
    const monthNum = MONTH_MAP[monthKey];
    if (monthNum) {
      return `${m[3]}-${String(monthNum).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
  }
  return null;
}

/** ISO yyyy-MM-dd of `d` in the user's local time (server is UTC; this is fine for BD which is UTC+6 — "today" matches user expectation). */
export function todayIso(d: Date = new Date()): string {
  // Use UTC date — the inbound pipeline runs on a server in any TZ but a
  // received-at timestamp's date portion is what we want.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
