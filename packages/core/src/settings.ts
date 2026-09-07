import { db } from "@fintrack/db";
import { users } from "@fintrack/db/schema";
import { SUPPORTED_CURRENCIES } from "@fintrack/shared/currencies";
import { eq } from "drizzle-orm";
import { NotFoundError } from "./errors";

export async function updateCurrency(userId: string, currency: string) {
    const valid = SUPPORTED_CURRENCIES.some((c) => c.code === currency);
    if (!valid) throw new Error("Invalid currency");

    await db
        .update(users)
        .set({ currency, updatedAt: new Date() })
        .where(eq(users.id, userId));
}

export async function getPasswordHash(userId: string): Promise<string> {
    const [user] = await db
        .select({ hashedPassword: users.hashedPassword })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    if (!user) throw new NotFoundError("User not found");
    return user.hashedPassword;
}

export async function setPasswordHash(userId: string, hash: string) {
    await db
        .update(users)
        .set({ hashedPassword: hash, updatedAt: new Date() })
        .where(eq(users.id, userId));
}

export async function deleteUser(userId: string) {
    await db.delete(users).where(eq(users.id, userId));
}
