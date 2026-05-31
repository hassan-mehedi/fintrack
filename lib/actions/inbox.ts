"use server";

import { db } from "@/lib/db";
import { inboundMessages, financialAccounts, categories } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { and, desc, eq, ilike, isNull, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { postTransaction } from "@/lib/ledger";
import { recordChange } from "@/lib/audit-entity";
import { findOrCreateMerchant } from "@/lib/merchants";
import { logger } from "@/lib/logger";
import type { ParsedTransaction } from "@/lib/inbound/types";

export async function listInbox(filters?: {
  status?: "received" | "parsed" | "needs_review" | "applied" | "ignored" | "failed";
  limit?: number;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const conds = [eq(inboundMessages.userId, session.user.id)];
  if (filters?.status) conds.push(eq(inboundMessages.status, filters.status));

  return db
    .select({
      id: inboundMessages.id,
      source: inboundMessages.source,
      status: inboundMessages.status,
      fromAddress: inboundMessages.fromAddress,
      subject: inboundMessages.subject,
      receivedAt: inboundMessages.receivedAt,
      parsed: inboundMessages.parsed,
      templateId: inboundMessages.templateId,
      confidence: inboundMessages.confidence,
      transactionId: inboundMessages.transactionId,
      rawBody: inboundMessages.rawBody,
    })
    .from(inboundMessages)
    .where(and(...conds))
    .orderBy(desc(inboundMessages.receivedAt))
    .limit(filters?.limit ?? 50);
}

export async function countInbox() {
  const session = await auth();
  if (!session?.user?.id) return 0;
  const rows = await db
    .select({ id: inboundMessages.id })
    .from(inboundMessages)
    .where(
      and(
        eq(inboundMessages.userId, session.user.id),
        inArray(inboundMessages.status, ["parsed", "needs_review"]),
      ),
    );
  return rows.length;
}

/**
 * Tries to resolve the inbound message's `accountHint` to one of the user's
 * actual financial accounts. Currently fuzzy: name ilike "%hint%" OR matching
 * substring in mobile_banking accounts.
 */
async function resolveAccountFromHint(userId: string, hint: string | null) {
  if (!hint) return null;
  const [direct] = await db
    .select({ id: financialAccounts.id })
    .from(financialAccounts)
    .where(
      and(
        eq(financialAccounts.userId, userId),
        eq(financialAccounts.status, "active"),
        ilike(financialAccounts.name, `%${hint}%`),
      ),
    )
    .limit(1);
  return direct?.id ?? null;
}

export async function acceptInboundMessage(args: {
  messageId: string;
  accountId?: string;
  categoryId?: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [msg] = await db
    .select()
    .from(inboundMessages)
    .where(
      and(eq(inboundMessages.id, args.messageId), eq(inboundMessages.userId, session.user.id)),
    )
    .limit(1);
  if (!msg) throw new Error("Inbound message not found");
  if (msg.status === "applied") throw new Error("Already applied");
  if (!msg.parsed) throw new Error("Message has no parsed data");

  const parsed = msg.parsed as unknown as ParsedTransaction;

  const accountId =
    args.accountId ?? (await resolveAccountFromHint(session.user.id, parsed.accountHint));
  if (!accountId) {
    throw new Error("Could not resolve account; pass accountId explicitly");
  }

  let categoryId = args.categoryId;
  if (!categoryId) {
    // Pick the user's first matching category by direction.
    const need = parsed.direction === "in" ? "income" : "expense";
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.userId, session.user.id),
          inArray(categories.type, [need as "income" | "expense", "both"]),
        ),
      )
      .limit(1);
    if (!cat) throw new Error("No category available; pass categoryId explicitly");
    categoryId = cat.id;
  }

  let merchantId: string | null = null;
  if (parsed.merchant) {
    try {
      const m = await findOrCreateMerchant(session.user.id, parsed.merchant);
      merchantId = m.id;
    } catch (err) {
      logger.warn({ err, merchant: parsed.merchant }, "merchant resolve failed");
    }
  }

  const txn = await postTransaction({
    userId: session.user.id,
    accountId,
    categoryId,
    amount: parsed.amount,
    fee: parsed.fee ?? 0,
    type: parsed.direction === "in" ? "income" : "expense",
    description: parsed.description,
    date: parsed.date,
    tags: [],
    merchantId,
    source: "inbound",
    externalId: parsed.refId,
    idempotencyKey: `inbound:${msg.id}`,
  });

  await db
    .update(inboundMessages)
    .set({ status: "applied", transactionId: txn.id })
    .where(eq(inboundMessages.id, msg.id));

  await recordChange({
    ctx: { userId: session.user.id, source: "inbound" },
    entity: "transaction",
    entityId: txn.id,
    action: "create",
    after: { inboundMessageId: msg.id, parsed } as unknown as Record<string, unknown>,
  });

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  return { transactionId: txn.id };
}

export async function ignoreInboundMessage(messageId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db
    .update(inboundMessages)
    .set({ status: "ignored" })
    .where(
      and(eq(inboundMessages.id, messageId), eq(inboundMessages.userId, session.user.id)),
    );

  revalidatePath("/inbox");
}

export async function deleteInboundMessage(messageId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db
    .delete(inboundMessages)
    .where(
      and(
        eq(inboundMessages.id, messageId),
        eq(inboundMessages.userId, session.user.id),
        // Only allow deletion of unapplied messages to keep audit linkage intact.
        isNull(inboundMessages.transactionId),
      ),
    );

  revalidatePath("/inbox");
}
