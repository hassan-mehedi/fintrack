"use server";

import { db } from "@/lib/db";
import { financialAccounts, postings, transactions, users } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { and, eq, sql, isNull } from "drizzle-orm";
import { financialAccountSchema } from "@/lib/validators";
import { revalidatePath } from "next/cache";
import { recordChange } from "@/lib/audit-entity";

export async function getAccounts() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  return db
    .select()
    .from(financialAccounts)
    .where(
      and(
        eq(financialAccounts.userId, session.user.id),
        eq(financialAccounts.status, "active"),
      ),
    );
}

export async function createAccount(data: unknown) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = financialAccountSchema.parse(data);

  let currency = parsed.currency;
  if (!currency) {
    const [u] = await db
      .select({ currency: users.currency })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    currency = u?.currency as typeof parsed.currency;
  }

  const [account] = await db
    .insert(financialAccounts)
    .values({
      userId: session.user.id,
      name: parsed.name,
      type: parsed.type,
      currency: currency!,
      balance: parsed.balance,
      icon: parsed.icon,
      color: parsed.color,
      defaultFeeRate: parsed.defaultFeeRate || null,
      creditLimit: parsed.creditLimit || null,
      isDefault: parsed.isDefault,
    })
    .returning();

  await recordChange({
    ctx: { userId: session.user.id },
    entity: "account",
    entityId: account.id,
    action: "create",
    after: account as unknown as Record<string, unknown>,
  });

  // Note: we deliberately do NOT auto-post an opening-balance ledger entry
  // here — the `balance` column stores the starting balance verbatim, and the
  // ledger writer adds to it on each subsequent transaction. The Phase-1
  // backfill script and any future reconciliation pass treat the stored
  // `balance` minus SUM(postings.amount with sign) as the implicit opening.

  revalidatePath("/");
  revalidatePath("/accounts");
  return account;
}

export async function updateAccount(id: string, data: unknown) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = financialAccountSchema.parse(data);

  const [before] = await db
    .select()
    .from(financialAccounts)
    .where(
      and(
        eq(financialAccounts.id, id),
        eq(financialAccounts.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!before) throw new Error("Account not found");

  const nextCurrency = parsed.currency ?? before.currency;
  if (before.currency !== nextCurrency) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(postings)
      .where(eq(postings.accountId, id));
    if (Number(count) > 0) {
      throw new Error(
        "Cannot change currency of an account that already has transactions",
      );
    }
  }

  const [account] = await db
    .update(financialAccounts)
    .set({
      name: parsed.name,
      type: parsed.type,
      currency: nextCurrency,
      balance: parsed.balance,
      icon: parsed.icon,
      color: parsed.color,
      defaultFeeRate: parsed.defaultFeeRate || null,
      creditLimit: parsed.creditLimit || null,
      isDefault: parsed.isDefault,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financialAccounts.id, id),
        eq(financialAccounts.userId, session.user.id),
      ),
    )
    .returning();

  await recordChange({
    ctx: { userId: session.user.id },
    entity: "account",
    entityId: id,
    action: "update",
    before: before as unknown as Record<string, unknown>,
    after: account as unknown as Record<string, unknown>,
  });

  revalidatePath("/");
  revalidatePath("/accounts");
  return account;
}

export async function deleteAccount(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [before] = await db
    .select()
    .from(financialAccounts)
    .where(
      and(
        eq(financialAccounts.id, id),
        eq(financialAccounts.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!before) throw new Error("Account not found");

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, id),
        isNull(transactions.deletedAt),
      ),
    );

  if (Number(count) > 0) {
    // Soft-archive: keep history intact.
    await db
      .update(financialAccounts)
      .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(financialAccounts.id, id),
          eq(financialAccounts.userId, session.user.id),
        ),
      );
    await recordChange({
      ctx: { userId: session.user.id },
      entity: "account",
      entityId: id,
      action: "delete",
      before: before as unknown as Record<string, unknown>,
      after: { ...before, status: "archived" } as unknown as Record<string, unknown>,
    });
  } else {
    await db
      .delete(financialAccounts)
      .where(
        and(
          eq(financialAccounts.id, id),
          eq(financialAccounts.userId, session.user.id),
        ),
      );
    await recordChange({
      ctx: { userId: session.user.id },
      entity: "account",
      entityId: id,
      action: "delete",
      before: before as unknown as Record<string, unknown>,
    });
  }

  revalidatePath("/");
  revalidatePath("/accounts");
}
