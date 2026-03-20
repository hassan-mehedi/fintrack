"use server";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";

export async function updateCurrency(currency: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const valid = SUPPORTED_CURRENCIES.some((c) => c.code === currency);
  if (!valid) throw new Error("Invalid currency");

  await db
    .update(users)
    .set({ currency, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));
}
