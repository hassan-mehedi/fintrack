import { db } from "@fintrack/db";
import { financialAccounts } from "@fintrack/db/schema";
import { financialAccountSchema } from "@fintrack/shared/validators";
import { and, eq } from "drizzle-orm";

export async function getAccounts(
    userId: string,
    options?: { includeArchived?: boolean }
) {
    return db
        .select()
        .from(financialAccounts)
        .where(
            and(
                eq(financialAccounts.userId, userId),
                options?.includeArchived
                    ? undefined
                    : eq(financialAccounts.isArchived, false)
            )
        );
}

export async function createAccount(userId: string, data: unknown) {
    const parsed = financialAccountSchema.parse(data);

    const [account] = await db
        .insert(financialAccounts)
        .values({
            userId,
            name: parsed.name,
            type: parsed.type,
            balance: parsed.balance,
            icon: parsed.icon,
            color: parsed.color,
            defaultFeeRate: parsed.defaultFeeRate || null,
            creditLimit: parsed.creditLimit || null,
            currency: parsed.currency || null,
            secondaryCurrency: parsed.secondaryCurrency || null,
            secondaryBalance: parsed.secondaryBalance || "0",
            secondaryCreditLimit: parsed.secondaryCreditLimit || null,
            isDefault: parsed.isDefault,
        })
        .returning();

    return account;
}

export async function updateAccount(userId: string, id: string, data: unknown) {
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
            currency: parsed.currency || null,
            secondaryCurrency: parsed.secondaryCurrency || null,
            secondaryBalance: parsed.secondaryBalance || "0",
            secondaryCreditLimit: parsed.secondaryCreditLimit || null,
            isDefault: parsed.isDefault,
            updatedAt: new Date(),
        })
        .where(
            and(eq(financialAccounts.id, id), eq(financialAccounts.userId, userId))
        )
        .returning();

    return account;
}

async function setArchived(userId: string, id: string, isArchived: boolean) {
    const [account] = await db
        .update(financialAccounts)
        .set({ isArchived, updatedAt: new Date() })
        .where(
            and(eq(financialAccounts.id, id), eq(financialAccounts.userId, userId))
        )
        .returning();

    return account;
}

export async function archiveAccount(userId: string, id: string) {
    return setArchived(userId, id, true);
}

export async function unarchiveAccount(userId: string, id: string) {
    return setArchived(userId, id, false);
}

export async function deleteAccount(userId: string, id: string) {
    await db
        .delete(financialAccounts)
        .where(
            and(eq(financialAccounts.id, id), eq(financialAccounts.userId, userId))
        );
}
