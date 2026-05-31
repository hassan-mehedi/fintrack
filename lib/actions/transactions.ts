"use server";

import { db } from "@/lib/db";
import {
  transactions,
  financialAccounts,
  categories,
} from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and, desc, gte, lte, sql, ilike, isNull, inArray } from "drizzle-orm";
import { transactionSchema } from "@/lib/validators";
import { revalidatePath } from "next/cache";
import {
  postTransaction,
  rewriteTransaction,
  voidTransaction,
  postSplitTransaction,
  rewriteSplitTransaction,
} from "@/lib/ledger";
import { recordChange } from "@/lib/audit-entity";

export async function getTransactions(filters?: {
  type?: string;
  categoryId?: string;
  accountId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const offset = (page - 1) * limit;

  const conditions = [
    eq(transactions.userId, session.user.id),
    isNull(transactions.deletedAt),
    // Hide split children from the main list — they're shown under their parent.
    isNull(transactions.parentId),
  ];

  if (filters?.type) {
    conditions.push(
      eq(transactions.type, filters.type as "income" | "expense" | "transfer")
    );
  }
  if (filters?.categoryId) {
    conditions.push(eq(transactions.categoryId, filters.categoryId));
  }
  if (filters?.accountId) {
    conditions.push(eq(transactions.accountId, filters.accountId));
  }
  if (filters?.startDate) {
    conditions.push(gte(transactions.date, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(transactions.date, filters.endDate));
  }
  if (filters?.search) {
    conditions.push(ilike(transactions.description, `%${filters.search}%`));
  }

  const [data, [countResult]] = await Promise.all([
    db
      .select({
        id: transactions.id,
        amount: transactions.amount,
        fee: transactions.fee,
        type: transactions.type,
        status: transactions.status,
        source: transactions.source,
        description: transactions.description,
        date: transactions.date,
        tags: transactions.tags,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        categoryColor: categories.color,
        accountId: transactions.accountId,
        accountName: financialAccounts.name,
        toAccountId: transactions.toAccountId,
        merchantId: transactions.merchantId,
        isReimbursable: transactions.isReimbursable,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .innerJoin(
        financialAccounts,
        eq(transactions.accountId, financialAccounts.id)
      )
      .where(and(...conditions))
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(and(...conditions)),
  ]);

  return {
    transactions: data.map((t) => ({
      ...t,
      amount: Number(t.amount),
      fee: Number(t.fee),
    })),
    total: Number(countResult.count),
    page,
    totalPages: Math.ceil(Number(countResult.count) / limit),
  };
}

export async function createTransaction(data: unknown) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = transactionSchema.parse(data);

  let txn: { id: string };
  if (parsed.splits && parsed.splits.length > 0) {
    if (parsed.type === "transfer") throw new Error("Cannot split a transfer");
    const result = await postSplitTransaction({
      userId: session.user.id,
      accountId: parsed.accountId,
      amount: Number(parsed.amount),
      fee: Number(parsed.fee || 0),
      type: parsed.type,
      status: parsed.status ?? "cleared",
      source: parsed.source ?? "manual",
      description: parsed.description || "",
      date: parsed.date,
      tags: parsed.tags || [],
      isReimbursable: parsed.isReimbursable ?? false,
      externalId: parsed.externalId ?? null,
      idempotencyKey: parsed.idempotencyKey ?? null,
      merchantId: parsed.merchantId ?? null,
      children: parsed.splits.map((c) => ({
        categoryId: c.categoryId,
        amount: Number(c.amount),
        description: c.description,
      })),
    });
    txn = { id: result.parentId };
  } else {
    txn = await postTransaction({
      userId: session.user.id,
      accountId: parsed.accountId,
      toAccountId: parsed.toAccountId ?? null,
      categoryId: parsed.categoryId,
      merchantId: parsed.merchantId ?? null,
      amount: Number(parsed.amount),
      fee: Number(parsed.fee || 0),
      type: parsed.type,
      status: parsed.status ?? "cleared",
      source: parsed.source ?? "manual",
      description: parsed.description || "",
      date: parsed.date,
      tags: parsed.tags || [],
      isReimbursable: parsed.isReimbursable ?? false,
      externalId: parsed.externalId ?? null,
      idempotencyKey: parsed.idempotencyKey ?? null,
    });
  }

  await recordChange({
    ctx: { userId: session.user.id, source: parsed.source ?? "manual" },
    entity: "transaction",
    entityId: txn.id,
    action: "create",
    after: { ...parsed, id: txn.id },
  });

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  return txn;
}

export async function updateTransaction(id: string, data: unknown) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = transactionSchema.parse(data);
  const userId = session.user.id;

  const [oldTxn] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .limit(1);
  if (!oldTxn) throw new Error("Transaction not found");
  if (oldTxn.deletedAt) throw new Error("Transaction is deleted");

  if (parsed.splits && parsed.splits.length > 0) {
    if (parsed.type === "transfer") throw new Error("Cannot split a transfer");
    await rewriteSplitTransaction({
      parentId: id,
      input: {
        userId,
        accountId: parsed.accountId,
        amount: Number(parsed.amount),
        fee: Number(parsed.fee || 0),
        type: parsed.type,
        status: parsed.status ?? oldTxn.status,
        source: parsed.source ?? oldTxn.source,
        description: parsed.description || "",
        date: parsed.date,
        tags: parsed.tags || [],
        isReimbursable: parsed.isReimbursable ?? oldTxn.isReimbursable,
        merchantId: parsed.merchantId ?? null,
        children: parsed.splits.map((c) => ({
          categoryId: c.categoryId,
          amount: Number(c.amount),
          description: c.description,
        })),
      },
    });
  } else {
    await rewriteTransaction(id, {
      userId,
      accountId: parsed.accountId,
      toAccountId: parsed.toAccountId ?? null,
      categoryId: parsed.categoryId,
      merchantId: parsed.merchantId ?? null,
      amount: Number(parsed.amount),
      fee: Number(parsed.fee || 0),
      type: parsed.type,
      status: parsed.status ?? oldTxn.status,
      description: parsed.description || "",
      date: parsed.date,
      tags: parsed.tags || [],
      isReimbursable: parsed.isReimbursable ?? oldTxn.isReimbursable,
    });
  }

  await recordChange({
    ctx: { userId, source: parsed.source ?? "manual" },
    entity: "transaction",
    entityId: id,
    action: "update",
    before: oldTxn as unknown as Record<string, unknown>,
    after: { ...parsed, id },
  });

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  return { id };
}

export async function deleteTransaction(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [old] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, session.user.id)))
    .limit(1);
  if (!old) throw new Error("Transaction not found");

  await voidTransaction({ transactionId: id, userId: session.user.id });

  await recordChange({
    ctx: { userId: session.user.id },
    entity: "transaction",
    entityId: id,
    action: "delete",
    before: old as unknown as Record<string, unknown>,
  });

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
}

export async function setTransactionStatus(
  id: string,
  status: "pending" | "cleared" | "reconciled",
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [before] = await db
    .select({ status: transactions.status })
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, session.user.id)))
    .limit(1);
  if (!before) throw new Error("Transaction not found");

  await db
    .update(transactions)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(transactions.id, id), eq(transactions.userId, session.user.id)));

  await recordChange({
    ctx: { userId: session.user.id },
    entity: "transaction",
    entityId: id,
    action: "update",
    before: { status: before.status },
    after: { status },
  });

  revalidatePath("/transactions");
}

export async function bulkSetTransactionStatus(
  ids: string[],
  status: "pending" | "cleared" | "reconciled",
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (ids.length === 0) return { updated: 0 };

  await db
    .update(transactions)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        inArray(transactions.id, ids),
        eq(transactions.userId, session.user.id),
        isNull(transactions.deletedAt),
      ),
    );

  await recordChange({
    ctx: { userId: session.user.id },
    entity: "transaction",
    entityId: ids[0],
    action: "update",
    before: { ids, count: ids.length },
    after: { status },
  });

  revalidatePath("/transactions");
  return { updated: ids.length };
}

export async function markReimbursed(
  expenseTransactionId: string,
  reimbursedByTransactionId: string | null,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [before] = await db
    .select({
      isReimbursable: transactions.isReimbursable,
      reimbursedAt: transactions.reimbursedAt,
      reimbursedByTransactionId: transactions.reimbursedByTransactionId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.id, expenseTransactionId),
        eq(transactions.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!before) throw new Error("Transaction not found");

  if (reimbursedByTransactionId) {
    // Sanity check: the linked transaction must belong to the same user
    // and be an income.
    const [linked] = await db
      .select({ type: transactions.type, userId: transactions.userId })
      .from(transactions)
      .where(eq(transactions.id, reimbursedByTransactionId))
      .limit(1);
    if (!linked || linked.userId !== session.user.id || linked.type !== "income") {
      throw new Error("Linked reimbursement must be your own income transaction");
    }
  }

  await db
    .update(transactions)
    .set({
      reimbursedAt: new Date(),
      reimbursedByTransactionId,
      isReimbursable: true,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(transactions.id, expenseTransactionId),
        eq(transactions.userId, session.user.id),
      ),
    );

  await recordChange({
    ctx: { userId: session.user.id },
    entity: "transaction",
    entityId: expenseTransactionId,
    action: "update",
    before: before as unknown as Record<string, unknown>,
    after: { reimbursedAt: new Date(), reimbursedByTransactionId },
  });

  revalidatePath("/transactions");
}

export async function clearReimbursed(expenseTransactionId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db
    .update(transactions)
    .set({
      reimbursedAt: null,
      reimbursedByTransactionId: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(transactions.id, expenseTransactionId),
        eq(transactions.userId, session.user.id),
      ),
    );

  revalidatePath("/transactions");
}

export async function bulkSetCategory(ids: string[], categoryId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (ids.length === 0) return { updated: 0 };

  // Verify the target category belongs to the user (defence in depth).
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, session.user.id)))
    .limit(1);
  if (!cat) throw new Error("Category not found");

  await db
    .update(transactions)
    .set({ categoryId, updatedAt: new Date() })
    .where(
      and(
        inArray(transactions.id, ids),
        eq(transactions.userId, session.user.id),
        isNull(transactions.deletedAt),
        // Don't rewrite split parents — their category is the __split__ system row.
        isNull(transactions.parentId),
      ),
    );

  await recordChange({
    ctx: { userId: session.user.id },
    entity: "transaction",
    entityId: ids[0],
    action: "update",
    before: { ids, count: ids.length },
    after: { categoryId },
  });

  revalidatePath("/transactions");
  return { updated: ids.length };
}

export async function bulkDeleteTransactions(ids: string[]) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (ids.length === 0) return { deleted: 0 };

  // Use voidTransaction (already cascades to children + reverses balance).
  // Done sequentially to keep balance arithmetic ordered.
  let count = 0;
  const { voidTransaction } = await import("@/lib/ledger");
  for (const id of ids) {
    try {
      await voidTransaction({ transactionId: id, userId: session.user.id });
      count++;
    } catch {
      // skip and continue
    }
  }

  await recordChange({
    ctx: { userId: session.user.id },
    entity: "transaction",
    entityId: ids[0],
    action: "delete",
    before: { ids, count: ids.length },
    after: { deleted: count },
  });

  revalidatePath("/transactions");
  revalidatePath("/accounts");
  return { deleted: count };
}

/**
 * Returns the children of a split transaction. Used by the transaction form
 * when editing an existing split.
 */
export async function getSplitChildren(parentId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const rows = await db
    .select({
      id: transactions.id,
      categoryId: transactions.categoryId,
      amount: transactions.amount,
      description: transactions.description,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.parentId, parentId),
        eq(transactions.userId, session.user.id),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(transactions.createdAt);
  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount),
  }));
}
