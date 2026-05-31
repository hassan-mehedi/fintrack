/**
 * Double-entry ledger writer.
 *
 * Every transaction emits N >= 2 postings whose `baseAmount` sums to zero
 * (within rounding). Sign convention:
 *   asset balance     = +SUM(postings.amount where accountId = X)
 *   liability balance = -SUM(postings.amount where accountId = X)
 *
 * Income/expense legs use a category as the counterparty. Transfers post
 * against two accounts. Fees flow into the user's system "Fees" category so
 * they remain trackable in analytics without breaking the zero-sum invariant.
 */

import { db } from "@/lib/db";
import {
  transactions,
  postings,
  financialAccounts,
  categories,
  users,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { getRate } from "@/lib/fx";
import { isLiabilityAccount } from "@/lib/accounts";
import { onTransactionPosted } from "@/lib/notifications/events";
import { logger } from "@/lib/logger";

const FEES_SYSTEM_KEY = "__fees__";
const SPLIT_SYSTEM_KEY = "__split__";
const EPSILON = 0.0001;

export type LedgerInput = {
  userId: string;
  accountId: string;
  toAccountId?: string | null;
  categoryId: string;
  amount: number;
  fee: number;
  type: "income" | "expense" | "transfer";
  description?: string;
  date: string; // yyyy-MM-dd
  tags?: string[];
  status?: "pending" | "cleared" | "reconciled" | "void";
  source?: "manual" | "import" | "recurring" | "ai" | "inbound";
  merchantId?: string | null;
  externalId?: string | null;
  importBatchId?: string | null;
  idempotencyKey?: string | null;
  isReimbursable?: boolean;
  recurringId?: string | null;
};

type AccountRow = {
  id: string;
  type: string;
  currency: string;
};

async function loadAccount(id: string): Promise<AccountRow> {
  const [row] = await db
    .select({
      id: financialAccounts.id,
      type: financialAccounts.type,
      currency: financialAccounts.currency,
    })
    .from(financialAccounts)
    .where(eq(financialAccounts.id, id))
    .limit(1);
  if (!row) throw new Error(`account ${id} not found`);
  return row;
}

async function getBaseCurrency(userId: string): Promise<string> {
  const [row] = await db
    .select({ currency: users.currency })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw new Error(`user ${userId} not found`);
  return row.currency;
}

async function ensureFeesCategory(userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.systemKey, FEES_SYSTEM_KEY)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
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
  return created.id;
}

async function ensureSplitCategory(userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.systemKey, SPLIT_SYSTEM_KEY)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(categories)
    .values({
      userId,
      name: "Split",
      icon: "🔀",
      color: "#94a3b8",
      type: "both",
      systemKey: SPLIT_SYSTEM_KEY,
      isDefault: false,
    })
    .returning({ id: categories.id });
  return created.id;
}

export type Leg = {
  accountId?: string;
  categoryId?: string;
  amount: number;
  currency: string;
};

export type LegInputs = {
  type: "income" | "expense" | "transfer";
  amount: number;
  fee: number;
  source: { id: string; type: string; currency: string };
  destination?: { id: string; type: string; currency: string };
  categoryId: string;
  feesCategoryId: string;
};

/**
 * Pure leg builder. Returns the signed postings for a given transaction
 * shape. Caller is responsible for FX conversion and persistence.
 */
export function computeLegs(input: LegInputs): Leg[] {
  const { type, amount, fee, source, destination, categoryId, feesCategoryId } = input;
  const legs: Leg[] = [];

  if (type === "income") {
    legs.push({ accountId: source.id, amount: amount - fee, currency: source.currency });
    legs.push({ categoryId, amount: -amount, currency: source.currency });
    if (fee > 0) {
      legs.push({ categoryId: feesCategoryId, amount: fee, currency: source.currency });
    }
  } else if (type === "expense") {
    legs.push({ accountId: source.id, amount: -(amount + fee), currency: source.currency });
    legs.push({ categoryId, amount, currency: source.currency });
    if (fee > 0) {
      legs.push({ categoryId: feesCategoryId, amount: fee, currency: source.currency });
    }
  } else {
    if (!destination) throw new Error("transfer requires destination");
    const srcLiab = isLiabilityAccount(source.type);
    const destLiab = isLiabilityAccount(destination.type);

    let srcAmt: number;
    let destAmt: number;
    if (!srcLiab && !destLiab) {
      srcAmt = -(amount + fee);
      destAmt = amount;
    } else if (!srcLiab && destLiab) {
      srcAmt = -(amount + fee);
      destAmt = amount; // debit on liability = debt down
    } else if (srcLiab && !destLiab) {
      srcAmt = -(amount + fee); // credit on liability = debt up
      destAmt = amount;
    } else {
      // liability -> liability: debt shuffle, fee borne via Fees category
      srcAmt = amount;
      destAmt = -amount;
    }

    legs.push({ accountId: source.id, amount: srcAmt, currency: source.currency });
    legs.push({ accountId: destination.id, amount: destAmt, currency: destination.currency });
    if (fee > 0) {
      legs.push({ categoryId: feesCategoryId, amount: fee, currency: source.currency });
    }
  }
  return legs;
}

async function buildLegs(input: LedgerInput): Promise<Leg[]> {
  const source = await loadAccount(input.accountId);
  const destination = input.toAccountId ? await loadAccount(input.toAccountId) : undefined;
  // Fees category is only needed when there is a fee.
  const feesCategoryId =
    input.fee > 0 ? await ensureFeesCategory(input.userId) : "";
  return computeLegs({
    type: input.type,
    amount: input.amount,
    fee: input.fee,
    source,
    destination,
    categoryId: input.categoryId,
    feesCategoryId,
  });
}

async function convertLegsToBase(
  legs: Leg[],
  baseCurrency: string,
  date: string,
): Promise<Array<Leg & { baseAmount: number; fxRate: number }>> {
  const out: Array<Leg & { baseAmount: number; fxRate: number }> = [];
  for (const leg of legs) {
    if (leg.currency === baseCurrency) {
      out.push({ ...leg, baseAmount: leg.amount, fxRate: 1 });
      continue;
    }
    const rate = await getRate(date, leg.currency, baseCurrency);
    out.push({ ...leg, baseAmount: leg.amount * rate, fxRate: rate });
  }
  return out;
}

function assertZeroSum(
  converted: Array<{ baseAmount: number }>,
  context: string,
): void {
  const sum = converted.reduce((s, l) => s + l.baseAmount, 0);
  if (Math.abs(sum) > EPSILON) {
    // FX rounding can leave fractional drift across mixed-currency transfers.
    // Allow up to 1 unit of base currency (e.g. 1 BDT) before we treat it as
    // a bug. Above that, refuse to write.
    if (Math.abs(sum) > 1) {
      throw new Error(`ledger imbalance in ${context}: sum = ${sum}`);
    }
  }
}

function fmt(n: number): string {
  return n.toFixed(4);
}

async function applyAccountBalances(
  legs: Array<{ accountId?: string; amount: number }>,
  accountTypes: Map<string, string>,
  direction: 1 | -1,
): Promise<void> {
  for (const leg of legs) {
    if (!leg.accountId) continue;
    const t = accountTypes.get(leg.accountId);
    if (!t) continue;
    const delta = isLiabilityAccount(t) ? -leg.amount : leg.amount;
    const signed = delta * direction;
    await db
      .update(financialAccounts)
      .set({
        balance: sql`${financialAccounts.balance}::numeric + ${signed.toFixed(4)}`,
        updatedAt: new Date(),
      })
      .where(eq(financialAccounts.id, leg.accountId));
  }
}

async function loadAccountTypes(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: financialAccounts.id, type: financialAccounts.type })
    .from(financialAccounts);
  return new Map(rows.filter((r) => ids.includes(r.id)).map((r) => [r.id, r.type]));
}

/**
 * Creates a transaction + its postings atomically and updates the cached
 * `financial_accounts.balance`. Honors idempotencyKey — repeating a call with
 * the same key returns the existing transaction row.
 */
export async function postTransaction(input: LedgerInput): Promise<{ id: string }> {
  if (input.idempotencyKey) {
    const [existing] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, input.userId),
          eq(transactions.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return existing;
  }

  const baseCurrency = await getBaseCurrency(input.userId);
  const legs = await buildLegs(input);
  const converted = await convertLegsToBase(legs, baseCurrency, input.date);
  assertZeroSum(converted, "postTransaction");

  const sqlClient = neon(process.env.DATABASE_URL!);
  await sqlClient`BEGIN`;
  try {
    const [txn] = await db
      .insert(transactions)
      .values({
        userId: input.userId,
        accountId: input.accountId,
        toAccountId: input.toAccountId ?? null,
        categoryId: input.categoryId,
        merchantId: input.merchantId ?? null,
        amount: fmt(input.amount),
        fee: fmt(input.fee),
        type: input.type,
        status: input.status ?? "cleared",
        source: input.source ?? "manual",
        description: input.description ?? "",
        date: input.date,
        tags: input.tags ?? [],
        recurringId: input.recurringId ?? null,
        externalId: input.externalId ?? null,
        importBatchId: input.importBatchId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        isReimbursable: input.isReimbursable ?? false,
      })
      .returning({ id: transactions.id });

    await db.insert(postings).values(
      converted.map((l) => ({
        transactionId: txn.id,
        userId: input.userId,
        accountId: l.accountId ?? null,
        categoryId: l.categoryId ?? null,
        amount: fmt(l.amount),
        currency: l.currency,
        baseAmount: fmt(l.baseAmount),
        baseCurrency,
        fxRate: l.fxRate.toFixed(8),
        date: input.date,
      })),
    );

    const accountIds = converted.map((l) => l.accountId).filter(Boolean) as string[];
    const types = await loadAccountTypes(accountIds);
    await applyAccountBalances(converted, types, 1);

    await sqlClient`COMMIT`;

    // Notifications run AFTER commit so a push failure can't roll back the
    // financial write. Fire-and-forget; the dispatcher logs its own errors.
    onTransactionPosted({
      userId: input.userId,
      transactionId: txn.id,
      type: input.type,
      categoryId: input.categoryId,
      amount: input.amount,
      date: input.date,
    }).catch((err) =>
      logger.warn({ err, userId: input.userId }, "transaction notification dispatch failed"),
    );

    return txn;
  } catch (err) {
    await sqlClient`ROLLBACK`;
    throw err;
  }
}

// ── Splits ─────────────────────────────────────────────
// A split is modelled as:
//   parent transaction      → account leg + __split__ category leg (+ fees)
//   one child per category  → __split__ category leg + real category leg
// Each row's postings still sum to zero in base currency; the split-virtual
// legs cancel out across parent + all children.
//
// Children do NOT touch an account directly — the parent owns the account leg.
// `transactions.parentId` on children points to the parent.

export type SplitChildInput = {
  categoryId: string;
  amount: number;
  description?: string;
};

export type SplitInput = Omit<LedgerInput, "categoryId" | "type"> & {
  /** Splits only support income or expense — transfers can't be split. */
  type: "income" | "expense";
  children: SplitChildInput[];
};

export function validateSplitChildren(args: {
  totalAmount: number;
  children: SplitChildInput[];
}): void {
  if (args.children.length < 2) {
    throw new Error("A split requires at least 2 children");
  }
  const sum = args.children.reduce((s, c) => s + c.amount, 0);
  if (Math.abs(sum - args.totalAmount) > EPSILON) {
    throw new Error(
      `Split children sum (${sum}) does not match parent amount (${args.totalAmount})`,
    );
  }
  for (const c of args.children) {
    if (!(c.amount > 0)) throw new Error("Child amount must be positive");
  }
}

/**
 * Posts a split transaction: one parent row + N child rows, all linked via
 * `transactions.parentId`. Honors idempotencyKey on the parent.
 */
export async function postSplitTransaction(
  input: SplitInput,
): Promise<{ parentId: string; childIds: string[] }> {
  validateSplitChildren({ totalAmount: input.amount, children: input.children });

  if (input.idempotencyKey) {
    const [existing] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, input.userId),
          eq(transactions.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      const children = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.parentId, existing.id));
      return { parentId: existing.id, childIds: children.map((c) => c.id) };
    }
  }

  const splitCategoryId = await ensureSplitCategory(input.userId);

  // Step 1: post the parent as a regular transaction but with the split-virtual
  // category. This handles the account leg, idempotency, audit-friendly insert,
  // and post-commit notification firing.
  const parent = await postTransaction({
    ...input,
    categoryId: splitCategoryId,
  });

  // Step 2: insert child rows + their (split, category) postings.
  const baseCurrency = await getBaseCurrency(input.userId);
  const sourceAccount = await loadAccount(input.accountId);
  const fxRate =
    sourceAccount.currency === baseCurrency
      ? 1
      : await getRate(input.date, sourceAccount.currency, baseCurrency);

  const childIds: string[] = [];
  for (const child of input.children) {
    // Income child: split-virtual +child, category -child  (income is credit-natured)
    // Expense child: split-virtual -child, category +child
    const splitAmt = input.type === "income" ? child.amount : -child.amount;
    const catAmt = input.type === "income" ? -child.amount : child.amount;

    const [row] = await db
      .insert(transactions)
      .values({
        userId: input.userId,
        accountId: input.accountId,
        categoryId: child.categoryId,
        amount: fmt(child.amount),
        fee: "0",
        type: input.type,
        status: input.status ?? "cleared",
        source: input.source ?? "manual",
        description: child.description ?? "",
        date: input.date,
        tags: [],
        parentId: parent.id,
      })
      .returning({ id: transactions.id });

    await db.insert(postings).values([
      {
        transactionId: row.id,
        userId: input.userId,
        categoryId: splitCategoryId,
        amount: fmt(splitAmt),
        currency: sourceAccount.currency,
        baseAmount: fmt(splitAmt * fxRate),
        baseCurrency,
        fxRate: fxRate.toFixed(8),
        date: input.date,
      },
      {
        transactionId: row.id,
        userId: input.userId,
        categoryId: child.categoryId,
        amount: fmt(catAmt),
        currency: sourceAccount.currency,
        baseAmount: fmt(catAmt * fxRate),
        baseCurrency,
        fxRate: fxRate.toFixed(8),
        date: input.date,
      },
    ]);
    childIds.push(row.id);
  }

  return { parentId: parent.id, childIds };
}

/**
 * Rewrites a split: replaces all children with a new set. The parent's
 * account leg is updated via `rewriteTransaction`. Pass `amount` and
 * `children` (the new set); other fields fall back to the existing parent's
 * values when omitted.
 */
export async function rewriteSplitTransaction(args: {
  parentId: string;
  input: SplitInput;
}): Promise<void> {
  validateSplitChildren({
    totalAmount: args.input.amount,
    children: args.input.children,
  });

  const splitCategoryId = await ensureSplitCategory(args.input.userId);

  // Delete all child transactions (cascades their postings via FK).
  await db.delete(transactions).where(eq(transactions.parentId, args.parentId));

  // Rewrite the parent with the (still) split-virtual category.
  await rewriteTransaction(args.parentId, {
    ...args.input,
    categoryId: splitCategoryId,
  });

  // Re-add children.
  const baseCurrency = await getBaseCurrency(args.input.userId);
  const sourceAccount = await loadAccount(args.input.accountId);
  const fxRate =
    sourceAccount.currency === baseCurrency
      ? 1
      : await getRate(args.input.date, sourceAccount.currency, baseCurrency);

  for (const child of args.input.children) {
    const splitAmt = args.input.type === "income" ? child.amount : -child.amount;
    const catAmt = args.input.type === "income" ? -child.amount : child.amount;
    const [row] = await db
      .insert(transactions)
      .values({
        userId: args.input.userId,
        accountId: args.input.accountId,
        categoryId: child.categoryId,
        amount: fmt(child.amount),
        fee: "0",
        type: args.input.type,
        status: args.input.status ?? "cleared",
        source: args.input.source ?? "manual",
        description: child.description ?? "",
        date: args.input.date,
        tags: [],
        parentId: args.parentId,
      })
      .returning({ id: transactions.id });

    await db.insert(postings).values([
      {
        transactionId: row.id,
        userId: args.input.userId,
        categoryId: splitCategoryId,
        amount: fmt(splitAmt),
        currency: sourceAccount.currency,
        baseAmount: fmt(splitAmt * fxRate),
        baseCurrency,
        fxRate: fxRate.toFixed(8),
        date: args.input.date,
      },
      {
        transactionId: row.id,
        userId: args.input.userId,
        categoryId: child.categoryId,
        amount: fmt(catAmt),
        currency: sourceAccount.currency,
        baseAmount: fmt(catAmt * fxRate),
        baseCurrency,
        fxRate: fxRate.toFixed(8),
        date: args.input.date,
      },
    ]);
  }
}

/**
 * Reverses balance effects of a transaction and replaces its postings with a
 * fresh set. Used by `updateTransaction`.
 */
export async function rewriteTransaction(
  transactionId: string,
  input: LedgerInput,
): Promise<void> {
  const baseCurrency = await getBaseCurrency(input.userId);
  const newLegs = await buildLegs(input);
  const newConverted = await convertLegsToBase(newLegs, baseCurrency, input.date);
  assertZeroSum(newConverted, "rewriteTransaction");

  const sqlClient = neon(process.env.DATABASE_URL!);
  await sqlClient`BEGIN`;
  try {
    const oldPostings = await db
      .select({ accountId: postings.accountId, amount: postings.amount })
      .from(postings)
      .where(eq(postings.transactionId, transactionId));

    const allAccountIds = [
      ...new Set(
        [
          ...oldPostings.map((p) => p.accountId),
          ...newConverted.map((l) => l.accountId),
        ].filter(Boolean) as string[],
      ),
    ];
    const types = await loadAccountTypes(allAccountIds);

    // Reverse old account effects
    await applyAccountBalances(
      oldPostings.map((p) => ({ accountId: p.accountId ?? undefined, amount: Number(p.amount) })),
      types,
      -1,
    );

    await db.delete(postings).where(eq(postings.transactionId, transactionId));

    await db
      .update(transactions)
      .set({
        accountId: input.accountId,
        toAccountId: input.toAccountId ?? null,
        categoryId: input.categoryId,
        merchantId: input.merchantId ?? null,
        amount: fmt(input.amount),
        fee: fmt(input.fee),
        type: input.type,
        status: input.status ?? "cleared",
        description: input.description ?? "",
        date: input.date,
        tags: input.tags ?? [],
        isReimbursable: input.isReimbursable ?? false,
        updatedAt: new Date(),
      })
      .where(
        and(eq(transactions.id, transactionId), eq(transactions.userId, input.userId)),
      );

    await db.insert(postings).values(
      newConverted.map((l) => ({
        transactionId,
        userId: input.userId,
        accountId: l.accountId ?? null,
        categoryId: l.categoryId ?? null,
        amount: fmt(l.amount),
        currency: l.currency,
        baseAmount: fmt(l.baseAmount),
        baseCurrency,
        fxRate: l.fxRate.toFixed(8),
        date: input.date,
      })),
    );

    await applyAccountBalances(newConverted, types, 1);
    await sqlClient`COMMIT`;
  } catch (err) {
    await sqlClient`ROLLBACK`;
    throw err;
  }
}

/**
 * Reverses a previous `voidTransaction`: clears deletedAt, re-applies the
 * stored postings to the account balance cache, and resurrects any split
 * children. The transaction's postings still exist in the DB (voidTransaction
 * never deletes them), so we just re-add their effects.
 */
export async function restoreTransaction(args: {
  transactionId: string;
  userId: string;
}): Promise<void> {
  const sqlClient = neon(process.env.DATABASE_URL!);
  await sqlClient`BEGIN`;
  try {
    const [txn] = await db
      .select({
        id: transactions.id,
        deletedAt: transactions.deletedAt,
        status: transactions.status,
      })
      .from(transactions)
      .where(
        and(eq(transactions.id, args.transactionId), eq(transactions.userId, args.userId)),
      )
      .limit(1);
    if (!txn) throw new Error("transaction not found");
    if (!txn.deletedAt) return; // already live

    const ps = await db
      .select({ accountId: postings.accountId, amount: postings.amount })
      .from(postings)
      .where(eq(postings.transactionId, args.transactionId));

    const accountIds = ps.map((p) => p.accountId).filter(Boolean) as string[];
    const types = await loadAccountTypes(accountIds);

    // Re-apply (direction = +1).
    await applyAccountBalances(
      ps.map((p) => ({ accountId: p.accountId ?? undefined, amount: Number(p.amount) })),
      types,
      1,
    );

    await db
      .update(transactions)
      .set({
        deletedAt: null,
        // Reverting from 'void' — best guess is "cleared". The user can move it
        // back to pending/reconciled if they were tracking that.
        status: "cleared",
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, args.transactionId));

    // Bring back any split children we soft-deleted alongside the parent.
    await db
      .update(transactions)
      .set({ deletedAt: null, status: "cleared", updatedAt: new Date() })
      .where(
        and(
          eq(transactions.parentId, args.transactionId),
          eq(transactions.userId, args.userId),
        ),
      );

    await sqlClient`COMMIT`;
  } catch (err) {
    await sqlClient`ROLLBACK`;
    throw err;
  }
}

/**
 * Soft-deletes a transaction and reverses its balance effects. Postings are
 * left in place but tagged via the transaction's `deletedAt`; queries should
 * filter out deleted txns and exclude their postings from balance reads.
 */
export async function voidTransaction(args: {
  transactionId: string;
  userId: string;
}): Promise<void> {
  const sqlClient = neon(process.env.DATABASE_URL!);
  await sqlClient`BEGIN`;
  try {
    const [txn] = await db
      .select({ id: transactions.id, deletedAt: transactions.deletedAt })
      .from(transactions)
      .where(
        and(eq(transactions.id, args.transactionId), eq(transactions.userId, args.userId)),
      )
      .limit(1);
    if (!txn) throw new Error("transaction not found");
    if (txn.deletedAt) return;

    const ps = await db
      .select({ accountId: postings.accountId, amount: postings.amount })
      .from(postings)
      .where(eq(postings.transactionId, args.transactionId));

    const accountIds = ps.map((p) => p.accountId).filter(Boolean) as string[];
    const types = await loadAccountTypes(accountIds);

    await applyAccountBalances(
      ps.map((p) => ({ accountId: p.accountId ?? undefined, amount: Number(p.amount) })),
      types,
      -1,
    );

    await db
      .update(transactions)
      .set({ deletedAt: new Date(), status: "void", updatedAt: new Date() })
      .where(eq(transactions.id, args.transactionId));

    // If this transaction has split children, soft-delete them as well.
    // Children carry no account postings (split-virtual ↔ category only), so
    // there's no balance to reverse — just mark them deleted.
    await db
      .update(transactions)
      .set({ deletedAt: new Date(), status: "void", updatedAt: new Date() })
      .where(
        and(
          eq(transactions.parentId, args.transactionId),
          eq(transactions.userId, args.userId),
        ),
      );

    await sqlClient`COMMIT`;
  } catch (err) {
    await sqlClient`ROLLBACK`;
    throw err;
  }
}
