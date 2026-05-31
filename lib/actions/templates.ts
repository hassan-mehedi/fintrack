"use server";

import { db } from "@/lib/db";
import { transactionTemplates } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { templateSchema } from "@/lib/templates";

export async function listTemplates() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return db
    .select()
    .from(transactionTemplates)
    .where(eq(transactionTemplates.userId, session.user.id))
    .orderBy(asc(transactionTemplates.sortOrder), asc(transactionTemplates.createdAt));
}

export async function createTemplate(input: unknown) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const parsed = templateSchema.parse(input);

  // Place at end of current sortOrder list.
  const [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${transactionTemplates.sortOrder}), 0)` })
    .from(transactionTemplates)
    .where(eq(transactionTemplates.userId, session.user.id));

  const [row] = await db
    .insert(transactionTemplates)
    .values({
      userId: session.user.id,
      name: parsed.name,
      accountId: parsed.accountId ?? null,
      categoryId: parsed.categoryId ?? null,
      amount: parsed.amount && parsed.amount !== "" ? parsed.amount : null,
      fee: parsed.fee || "0",
      type: parsed.type,
      description: parsed.description ?? "",
      tags: parsed.tags ?? [],
      icon: parsed.icon ?? null,
      sortOrder: Number(max ?? 0) + 1,
    })
    .returning();

  revalidatePath("/settings");
  revalidatePath("/transactions");
  return row;
}

export async function updateTemplate(id: string, input: unknown) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const parsed = templateSchema.parse(input);

  const [row] = await db
    .update(transactionTemplates)
    .set({
      name: parsed.name,
      accountId: parsed.accountId ?? null,
      categoryId: parsed.categoryId ?? null,
      amount: parsed.amount && parsed.amount !== "" ? parsed.amount : null,
      fee: parsed.fee || "0",
      type: parsed.type,
      description: parsed.description ?? "",
      tags: parsed.tags ?? [],
      icon: parsed.icon ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(transactionTemplates.id, id),
        eq(transactionTemplates.userId, session.user.id),
      ),
    )
    .returning();

  revalidatePath("/settings");
  revalidatePath("/transactions");
  return row;
}

export async function deleteTemplate(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await db
    .delete(transactionTemplates)
    .where(
      and(
        eq(transactionTemplates.id, id),
        eq(transactionTemplates.userId, session.user.id),
      ),
    );
  revalidatePath("/settings");
  revalidatePath("/transactions");
}

export async function reorderTemplates(orderedIds: string[]) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  if (orderedIds.length === 0) return;

  // Ensure all belong to this user.
  const owned = await db
    .select({ id: transactionTemplates.id })
    .from(transactionTemplates)
    .where(
      and(
        eq(transactionTemplates.userId, session.user.id),
        inArray(transactionTemplates.id, orderedIds),
      ),
    );
  const ownedIds = new Set(owned.map((o) => o.id));
  const filtered = orderedIds.filter((id) => ownedIds.has(id));

  for (let i = 0; i < filtered.length; i++) {
    await db
      .update(transactionTemplates)
      .set({ sortOrder: i + 1 })
      .where(eq(transactionTemplates.id, filtered[i]));
  }
  revalidatePath("/settings");
}
