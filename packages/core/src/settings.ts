import { db } from "@fintrack/db";
import { users } from "@fintrack/db/schema";
import { SUPPORTED_CURRENCIES } from "@fintrack/shared/currencies";
import { eq } from "drizzle-orm";

export async function updateCurrency(userId: string, currency: string) {
    const valid = SUPPORTED_CURRENCIES.some((c) => c.code === currency);
    if (!valid) throw new Error("Invalid currency");

    await db
        .update(users)
        .set({ currency, updatedAt: new Date() })
        .where(eq(users.id, userId));
}
