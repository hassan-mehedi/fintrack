"use server";

import { db } from "@/lib/db";
import { financialAccounts } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { financialAccountSchema } from "@/lib/validators";
import { revalidatePath } from "next/cache";

export async function getAccounts() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  return db
    .select()
    .from(financialAccounts)
    .where(eq(financialAccounts.userId, session.user.id));
}

export async function createAccount(data: unknown) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = financialAccountSchema.parse(data);

  const [account] = await db
    .insert(financialAccounts)
    .values({
      userId: session.user.id,
      name: parsed.name,
      type: parsed.type,
      balance: parsed.balance,
      icon: parsed.icon,
      color: parsed.color,
      defaultFeeRate: parsed.defaultFeeRate || null,
      creditLimit: parsed.creditLimit || null,
      isDefault: parsed.isDefault,
    })
    .returning();

  revalidatePath("/");
  revalidatePath("/accounts");
  return account;
}

export async function updateAccount(id: string, data: unknown) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = financialAccountSchema.parse(data);

  const [account] = await db
    .update(financialAccounts)
    .set({
      name: parsed.name,
      type: parsed.type,
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
        eq(financialAccounts.userId, session.user.id)
      )
    )
    .returning();

  revalidatePath("/");
  revalidatePath("/accounts");
  return account;
}

export async function deleteAccount(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db
    .delete(financialAccounts)
    .where(
      and(
        eq(financialAccounts.id, id),
        eq(financialAccounts.userId, session.user.id)
      )
    );

  revalidatePath("/");
  revalidatePath("/accounts");
}
