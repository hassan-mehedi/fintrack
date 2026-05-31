/**
 * Phase 1 backfill — run ONCE after `npm run db:push` has applied the new schema.
 *
 *   npm run db:push
 *   node --experimental-strip-types --env-file=.env scripts/phase1-backfill.ts
 *
 * What this does (idempotent):
 *   1. Sets every existing financial_account.currency to its owner's
 *      users.currency where it was left at the schema default.
 *   2. Ensures a system "Fees" category exists per user that has any
 *      fee>0 transaction (system_key = '__fees__').
 *   3. For every transaction without postings, writes the matching
 *      double-entry postings (account + category + optional fees leg).
 *   4. Recomputes financial_accounts.balance from the postings ledger and
 *      flags drift vs the previously cached balance.
 *
 * Re-running is safe — it skips transactions that already have postings.
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  users,
  financialAccounts,
  categories,
  transactions,
  postings,
} from "../lib/db/schema.ts";

const FEES_SYSTEM_KEY = "__fees__";

const ASSET_TYPES = new Set(["bank", "mobile_banking", "cash", "custom"]);
const LIABILITY_TYPES = new Set(["credit_card", "loan"]);

function isLiability(type: string): boolean {
  if (LIABILITY_TYPES.has(type)) return true;
  if (ASSET_TYPES.has(type)) return false;
  return false;
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const client = neon(process.env.DATABASE_URL);
const db = drizzle(client);

async function ensureFeesCategory(userId: string, userCurrency: string): Promise<string> {
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.systemKey, FEES_SYSTEM_KEY)))
    .limit(1);
  if (existing) return existing.id;

  const [inserted] = await db
    .insert(categories)
    .values({
      userId,
      name: "Fees",
      icon: "💸",
      color: "#9ca3af",
      type: "expense",
      systemKey: FEES_SYSTEM_KEY,
      isDefault: false,
    })
    .returning({ id: categories.id });
  return inserted.id;
}

type Txn = {
  id: string;
  userId: string;
  accountId: string;
  toAccountId: string | null;
  categoryId: string;
  amount: string;
  fee: string;
  type: "income" | "expense" | "transfer";
  date: string;
};

type Account = { id: string; type: string; currency: string };

async function loadAccounts(userId: string): Promise<Map<string, Account>> {
  const rows = await db
    .select({
      id: financialAccounts.id,
      type: financialAccounts.type,
      currency: financialAccounts.currency,
    })
    .from(financialAccounts)
    .where(eq(financialAccounts.userId, userId));
  return new Map(rows.map((r) => [r.id, r]));
}

function num(s: string): number {
  return Number.parseFloat(s);
}

function fmt(n: number): string {
  return n.toFixed(4);
}

async function backfillUser(userId: string, baseCurrency: string) {
  const accounts = await loadAccounts(userId);

  const txnRows = await db
    .select({
      id: transactions.id,
      userId: transactions.userId,
      accountId: transactions.accountId,
      toAccountId: transactions.toAccountId,
      categoryId: transactions.categoryId,
      amount: transactions.amount,
      fee: transactions.fee,
      type: transactions.type,
      date: transactions.date,
    })
    .from(transactions)
    .where(eq(transactions.userId, userId));

  if (txnRows.length === 0) return { backfilled: 0, skipped: 0 };

  const existingPostings = await db
    .select({ transactionId: postings.transactionId })
    .from(postings)
    .where(eq(postings.userId, userId));
  const haveLedger = new Set(existingPostings.map((p) => p.transactionId));

  let feesCategoryId: string | null = null;
  const ensureFees = async (): Promise<string> => {
    if (!feesCategoryId) feesCategoryId = await ensureFeesCategory(userId, baseCurrency);
    return feesCategoryId;
  };

  let backfilled = 0;
  let skipped = 0;

  for (const t of txnRows as Txn[]) {
    if (haveLedger.has(t.id)) {
      skipped++;
      continue;
    }
    const amount = num(t.amount);
    const fee = num(t.fee);
    const src = accounts.get(t.accountId);
    if (!src) {
      console.warn(`txn ${t.id}: source account ${t.accountId} missing — skipping`);
      continue;
    }

    const legs: Array<{
      accountId?: string;
      categoryId?: string;
      amount: number;
      currency: string;
    }> = [];

    if (t.type === "income") {
      // account +(amount-fee), category(income) -amount, fees +fee
      legs.push({ accountId: src.id, amount: amount - fee, currency: src.currency });
      legs.push({ categoryId: t.categoryId, amount: -amount, currency: src.currency });
      if (fee > 0) {
        legs.push({ categoryId: await ensureFees(), amount: fee, currency: src.currency });
      }
    } else if (t.type === "expense") {
      // account -(amount+fee), category(expense) +amount, fees +fee
      legs.push({ accountId: src.id, amount: -(amount + fee), currency: src.currency });
      legs.push({ categoryId: t.categoryId, amount: amount, currency: src.currency });
      if (fee > 0) {
        legs.push({ categoryId: await ensureFees(), amount: fee, currency: src.currency });
      }
    } else if (t.type === "transfer") {
      const dest = t.toAccountId ? accounts.get(t.toAccountId) : null;
      if (!dest) {
        console.warn(`txn ${t.id}: transfer with missing destination — skipping`);
        continue;
      }
      const srcLiab = isLiability(src.type);
      const destLiab = isLiability(dest.type);

      // Source account posting (mirrors getTransferDeltas, expressed in signed
      // posting amounts where asset balance = +SUM and liability balance = -SUM).
      let srcAmt: number;
      let destAmt: number;

      if (!srcLiab && !destLiab) {
        // asset -> asset
        srcAmt = -(amount + fee);
        destAmt = amount;
      } else if (!srcLiab && destLiab) {
        // asset -> liability (paying off debt)
        srcAmt = -(amount + fee);
        destAmt = amount; // debit on liability = debt down (balance goes -amount)
      } else if (srcLiab && !destLiab) {
        // liability -> asset (cash advance / borrow)
        srcAmt = -(amount + fee); // credit on liability = debt up (balance goes +(amount+fee))
        destAmt = amount;
      } else {
        // liability -> liability (rare; we bend the legacy math so postings balance:
        // source debt down by amount, dest debt up by amount, fee charged to Fees)
        srcAmt = amount; // debit liability = debt down by amount
        destAmt = -amount; // credit liability = debt up by amount
        if (fee > 0) {
          console.warn(
            `txn ${t.id}: liability→liability transfer with fee=${fee} — backfill bends legacy math; review.`,
          );
        }
      }

      legs.push({ accountId: src.id, amount: srcAmt, currency: src.currency });
      legs.push({ accountId: dest.id, amount: destAmt, currency: dest.currency });
      if (fee > 0) {
        legs.push({ categoryId: await ensureFees(), amount: fee, currency: src.currency });
      }
    }

    const sum = legs.reduce((s, l) => s + l.amount, 0);
    if (Math.abs(sum) > 0.0001) {
      console.warn(`txn ${t.id}: posting sum ${sum} ≠ 0; skipping`);
      continue;
    }

    await db.insert(postings).values(
      legs.map((l) => ({
        transactionId: t.id,
        userId,
        accountId: l.accountId ?? null,
        categoryId: l.categoryId ?? null,
        amount: fmt(l.amount),
        currency: l.currency,
        // pre-Phase 1 data is single-currency per user, so base = own currency, rate = 1
        baseAmount: fmt(l.amount),
        baseCurrency,
        fxRate: "1",
        date: t.date,
      })),
    );
    backfilled++;
  }
  return { backfilled, skipped };
}

async function recomputeBalances(userId: string) {
  const accounts = await db
    .select({ id: financialAccounts.id, type: financialAccounts.type, balance: financialAccounts.balance })
    .from(financialAccounts)
    .where(eq(financialAccounts.userId, userId));

  for (const acc of accounts) {
    const [{ sum: sumRaw }] = await db
      .select({ sum: sql<string>`COALESCE(SUM(${postings.amount}::numeric), 0)` })
      .from(postings)
      .where(eq(postings.accountId, acc.id));
    const sum = Number(sumRaw);
    const newBalance = isLiability(acc.type) ? -sum : sum;
    const old = Number(acc.balance);
    if (Math.abs(newBalance - old) > 0.01) {
      console.log(`  account ${acc.id} (${acc.type}): balance ${old} → ${newBalance.toFixed(4)} (drift ${(newBalance - old).toFixed(4)})`);
    }
    await db
      .update(financialAccounts)
      .set({ balance: newBalance.toFixed(4) })
      .where(eq(financialAccounts.id, acc.id));
  }
}

async function fixAccountCurrencies() {
  const result = await db.execute(sql`
    UPDATE financial_accounts fa
    SET currency = u.currency
    FROM users u
    WHERE fa.user_id = u.id
      AND fa.currency = 'BDT'
      AND u.currency != 'BDT'
  `);
  console.log(`Updated ${(result as { rowCount?: number }).rowCount ?? 0} account currencies from user base.`);
}

async function main() {
  console.log("Phase 1 backfill starting...");
  await fixAccountCurrencies();

  const allUsers = await db.select({ id: users.id, currency: users.currency }).from(users);
  console.log(`Backfilling ledger for ${allUsers.length} user(s).`);

  let totalBackfilled = 0;
  let totalSkipped = 0;
  for (const u of allUsers) {
    console.log(`\nUser ${u.id} (base ${u.currency}):`);
    const { backfilled, skipped } = await backfillUser(u.id, u.currency);
    totalBackfilled += backfilled;
    totalSkipped += skipped;
    console.log(`  postings created for ${backfilled} txns, ${skipped} already had postings`);
    await recomputeBalances(u.id);
  }
  console.log(`\nDone. Total: ${totalBackfilled} backfilled, ${totalSkipped} skipped.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
