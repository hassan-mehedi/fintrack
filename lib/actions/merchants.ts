"use server";

import { db } from "@/lib/db";
import { merchants, categories } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { and, eq, ilike, desc } from "drizzle-orm";
import { findOrCreateMerchant, normalizeMerchantName } from "@/lib/merchants";
import { recordChange } from "@/lib/audit-entity";

export async function searchMerchants(query: string, limit = 8) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const q = query.trim();
  if (!q) return [];

  const rows = await db
    .select({
      id: merchants.id,
      name: merchants.name,
      defaultCategoryId: merchants.defaultCategoryId,
      defaultCategoryName: categories.name,
      defaultCategoryIcon: categories.icon,
    })
    .from(merchants)
    .leftJoin(categories, eq(merchants.defaultCategoryId, categories.id))
    .where(
      and(
        eq(merchants.userId, session.user.id),
        ilike(merchants.normalized, `%${normalizeMerchantName(q)}%`),
      ),
    )
    .orderBy(desc(merchants.createdAt))
    .limit(limit);
  return rows;
}

export async function ensureMerchant(name: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const m = await findOrCreateMerchant(session.user.id, name);
  return m;
}

export async function setDefaultCategoryForMerchant(
  merchantId: string,
  categoryId: string | null,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [before] = await db
    .select()
    .from(merchants)
    .where(and(eq(merchants.id, merchantId), eq(merchants.userId, session.user.id)))
    .limit(1);
  if (!before) throw new Error("Merchant not found");

  const [after] = await db
    .update(merchants)
    .set({ defaultCategoryId: categoryId })
    .where(and(eq(merchants.id, merchantId), eq(merchants.userId, session.user.id)))
    .returning();

  await recordChange({
    ctx: { userId: session.user.id },
    entity: "merchant",
    entityId: merchantId,
    action: "update",
    before: before as unknown as Record<string, unknown>,
    after: after as unknown as Record<string, unknown>,
  });

  return after;
}
