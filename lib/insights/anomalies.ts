/**
 * Anomaly detectors. All deterministic — no LLM, no external API.
 *
 * Each detector:
 *   1. queries the user's recent ledger state
 *   2. produces zero or more InsightDraft rows
 *   3. attaches a stable `dedupeKey` so re-running the cron doesn't duplicate
 *      already-flagged items
 *
 * Persistence is delegated to `lib/insights/persist.ts`.
 */

import { db } from "@/lib/db";
import {
  transactions,
  recurringTransactions,
  categories,
} from "@/lib/db/schema";
import { and, eq, gte, isNull, desc } from "drizzle-orm";
import { format } from "date-fns";

export type Severity = "info" | "warning" | "critical";

export type InsightDraft = {
  kind:
    | "duplicate"
    | "outlier"
    | "subscription_creep"
    | "cashflow_warning"
    | "weekly_digest"
    | "savings_tip"
    | "large_share"
    | "recurring_drift";
  severity: Severity;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
};

const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;
const OUTLIER_MIN_SAMPLES = 10;
const OUTLIER_STDEV_THRESHOLD = 3;
const SUBSCRIPTION_CREEP_THRESHOLD = 0.1; // 10% MoM rise

// ─── Pure helpers (testable without DB) ─────────────────────────────────────

export function meanAndStdev(values: number[]): { mean: number; stdev: number } {
  if (values.length === 0) return { mean: 0, stdev: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, stdev: Math.sqrt(variance) };
}

export function isOutlier(
  amount: number,
  history: number[],
  opts: { minSamples?: number; threshold?: number } = {},
): boolean {
  const minSamples = opts.minSamples ?? OUTLIER_MIN_SAMPLES;
  const threshold = opts.threshold ?? OUTLIER_STDEV_THRESHOLD;
  if (history.length < minSamples) return false;
  const { mean, stdev } = meanAndStdev(history);
  if (stdev === 0) return false;
  return amount > mean + threshold * stdev;
}

export type DuplicateCandidate = {
  id: string;
  accountId: string;
  merchantId: string | null;
  amount: number;
  createdAt: Date;
};

/**
 * Pairs up transactions that share account+merchant+amount within the
 * configured window. Each pair appears once as (earlier, later).
 */
export function findDuplicatePairs(
  rows: DuplicateCandidate[],
  windowMs = DUPLICATE_WINDOW_MS,
): Array<{ a: DuplicateCandidate; b: DuplicateCandidate }> {
  // Sort by (account, merchant, amount, createdAt) and slide a window.
  const sorted = [...rows].sort((x, y) => {
    if (x.accountId !== y.accountId) return x.accountId.localeCompare(y.accountId);
    const mx = x.merchantId ?? "";
    const my = y.merchantId ?? "";
    if (mx !== my) return mx.localeCompare(my);
    if (x.amount !== y.amount) return x.amount - y.amount;
    return x.createdAt.getTime() - y.createdAt.getTime();
  });

  const pairs: Array<{ a: DuplicateCandidate; b: DuplicateCandidate }> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a.accountId !== b.accountId) continue;
    if ((a.merchantId ?? "") !== (b.merchantId ?? "")) continue;
    if (a.amount !== b.amount) continue;
    const dt = b.createdAt.getTime() - a.createdAt.getTime();
    if (dt <= windowMs) pairs.push({ a, b });
  }
  return pairs;
}

// ─── DB-driven detectors ────────────────────────────────────────────────────

export async function detectDuplicates(userId: string): Promise<InsightDraft[]> {
  // Look back 30 days. Anything older is unlikely to be a fresh duplicate.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      merchantId: transactions.merchantId,
      amount: transactions.amount,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        isNull(transactions.deletedAt),
        isNull(transactions.parentId),
        gte(transactions.createdAt, since),
      ),
    );

  const candidates: DuplicateCandidate[] = rows.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    merchantId: r.merchantId,
    amount: Number(r.amount),
    createdAt: r.createdAt,
  }));

  const pairs = findDuplicatePairs(candidates);

  return pairs.map(({ a, b }) => ({
    kind: "duplicate" as const,
    severity: "warning" as const,
    title: "Possible duplicate transaction",
    body: `Two ${formatMoney(a.amount)} charges on the same account within ${Math.round(
      (b.createdAt.getTime() - a.createdAt.getTime()) / 1000,
    )}s.`,
    payload: {
      firstTransactionId: a.id,
      secondTransactionId: b.id,
      accountId: a.accountId,
      amount: a.amount,
    },
    // Stable: same pair → same key, no re-fires.
    dedupeKey: `duplicate:${[a.id, b.id].sort().join(":")}`,
  }));
}

export async function detectOutliers(userId: string): Promise<InsightDraft[]> {
  const ninetyDaysAgo = format(
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    "yyyy-MM-dd",
  );
  const sevenDaysAgo = format(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    "yyyy-MM-dd",
  );

  // Pull every standalone (non-split-parent), non-deleted expense from the
  // last 90d. Group by category in JS — small data and lets us reuse the pure
  // outlier helper.
  const rows = await db
    .select({
      id: transactions.id,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      amount: transactions.amount,
      date: transactions.date,
      description: transactions.description,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "expense"),
        isNull(transactions.deletedAt),
        isNull(transactions.parentId),
        isNull(categories.systemKey),
        gte(transactions.date, ninetyDaysAgo),
      ),
    )
    .orderBy(desc(transactions.date));

  const byCategory = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byCategory.get(r.categoryId) ?? [];
    arr.push(r);
    byCategory.set(r.categoryId, arr);
  }

  const out: InsightDraft[] = [];
  for (const [, items] of byCategory) {
    const amounts = items.map((i) => Number(i.amount));
    const { mean, stdev } = meanAndStdev(amounts);
    for (const r of items) {
      if (r.date < sevenDaysAgo) continue; // only flag recent outliers
      const amount = Number(r.amount);
      if (
        isOutlier(amount, amounts, {
          minSamples: OUTLIER_MIN_SAMPLES,
          threshold: OUTLIER_STDEV_THRESHOLD,
        })
      ) {
        out.push({
          kind: "outlier",
          severity: "info",
          title: `Unusually high ${r.categoryName} expense`,
          body: `${formatMoney(amount)} on ${r.date} — typical for this category is around ${formatMoney(mean)} (stdev ${formatMoney(stdev)}).`,
          payload: {
            transactionId: r.id,
            categoryId: r.categoryId,
            categoryName: r.categoryName,
            amount,
            mean,
            stdev,
          },
          dedupeKey: `outlier:${r.id}`,
        });
      }
    }
  }
  return out;
}

export async function detectSubscriptionCreep(
  userId: string,
): Promise<InsightDraft[]> {
  // Walk active recurring expense rules. For each, look at the last two
  // posted instances (via transactions.recurringId) and compare amounts.
  const rules = await db
    .select({
      id: recurringTransactions.id,
      description: recurringTransactions.description,
      amount: recurringTransactions.amount,
    })
    .from(recurringTransactions)
    .where(
      and(
        eq(recurringTransactions.userId, userId),
        eq(recurringTransactions.isActive, true),
        eq(recurringTransactions.type, "expense"),
      ),
    );

  const out: InsightDraft[] = [];
  for (const rule of rules) {
    const recent = await db
      .select({
        id: transactions.id,
        amount: transactions.amount,
        date: transactions.date,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.recurringId, rule.id),
          isNull(transactions.deletedAt),
        ),
      )
      .orderBy(desc(transactions.date))
      .limit(2);

    if (recent.length < 2) continue;
    const latest = Number(recent[0].amount);
    const previous = Number(recent[1].amount);
    if (previous <= 0) continue;
    const pctChange = (latest - previous) / previous;
    if (pctChange < SUBSCRIPTION_CREEP_THRESHOLD) continue;

    out.push({
      kind: "subscription_creep",
      severity: pctChange >= 0.25 ? "warning" : "info",
      title: `Price went up: ${rule.description}`,
      body: `Latest charge ${formatMoney(latest)} vs previous ${formatMoney(previous)} — up ${(pctChange * 100).toFixed(1)}%.`,
      payload: {
        recurringId: rule.id,
        latestTransactionId: recent[0].id,
        previousAmount: previous,
        latestAmount: latest,
        pctChange,
      },
      // Re-fires once per new increase: dedupe key includes the latest txn id.
      dedupeKey: `subcreep:${rule.id}:${recent[0].id}`,
    });
  }
  return out;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Convenience: run all detectors for one user. */
export async function detectAllForUser(userId: string): Promise<InsightDraft[]> {
  const [d, o, s] = await Promise.all([
    detectDuplicates(userId),
    detectOutliers(userId),
    detectSubscriptionCreep(userId),
  ]);
  return [...d, ...o, ...s];
}
