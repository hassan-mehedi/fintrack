import { db } from "@fintrack/db";
import {
    categories,
    financialAccounts,
    recurringTransactions,
} from "@fintrack/db/schema";
import { recurringTransactionSchema } from "@fintrack/shared/validators";
import { and, desc, eq } from "drizzle-orm";
import { getNextDueDate } from "./recurring-processor";

export async function getRecurringTransactions(userId: string) {
    const data = await db
        .select({
            id: recurringTransactions.id,
            userId: recurringTransactions.userId,
            accountId: recurringTransactions.accountId,
            categoryId: recurringTransactions.categoryId,
            amount: recurringTransactions.amount,
            fee: recurringTransactions.fee,
            type: recurringTransactions.type,
            description: recurringTransactions.description,
            frequency: recurringTransactions.frequency,
            startDate: recurringTransactions.startDate,
            endDate: recurringTransactions.endDate,
            isActive: recurringTransactions.isActive,
            lastProcessed: recurringTransactions.lastProcessed,
            tags: recurringTransactions.tags,
            reminderDays: recurringTransactions.reminderDays,
            createdAt: recurringTransactions.createdAt,
            categoryName: categories.name,
            categoryIcon: categories.icon,
            accountName: financialAccounts.name,
        })
        .from(recurringTransactions)
        .innerJoin(categories, eq(recurringTransactions.categoryId, categories.id))
        .innerJoin(
            financialAccounts,
            eq(recurringTransactions.accountId, financialAccounts.id)
        )
        .where(eq(recurringTransactions.userId, userId))
        .orderBy(desc(recurringTransactions.createdAt));

    const today = new Date();
    return data.map((r) => ({
        ...r,
        amount: Number(r.amount),
        fee: Number(r.fee),
        nextDueDate: getNextDueDate(r, today),
    }));
}

export async function createRecurringTransaction(userId: string, data: unknown) {
    const parsed = recurringTransactionSchema.parse(data);

    const [result] = await db
        .insert(recurringTransactions)
        .values({
            userId,
            accountId: parsed.accountId,
            categoryId: parsed.categoryId,
            amount: parsed.amount,
            fee: parsed.fee || "0",
            type: parsed.type,
            description: parsed.description,
            frequency: parsed.frequency,
            startDate: parsed.startDate,
            endDate: parsed.endDate || null,
            tags: parsed.tags,
            reminderDays: parsed.reminderDays ?? null,
        })
        .returning();

    return result;
}

export async function updateRecurringTransaction(
    userId: string,
    id: string,
    data: unknown
) {
    const parsed = recurringTransactionSchema.parse(data);

    await db
        .update(recurringTransactions)
        .set({
            accountId: parsed.accountId,
            categoryId: parsed.categoryId,
            amount: parsed.amount,
            fee: parsed.fee || "0",
            type: parsed.type,
            description: parsed.description,
            frequency: parsed.frequency,
            startDate: parsed.startDate,
            endDate: parsed.endDate || null,
            tags: parsed.tags,
            reminderDays: parsed.reminderDays ?? null,
        })
        .where(
            and(
                eq(recurringTransactions.id, id),
                eq(recurringTransactions.userId, userId)
            )
        );
}

export async function deleteRecurringTransaction(userId: string, id: string) {
    await db
        .delete(recurringTransactions)
        .where(
            and(
                eq(recurringTransactions.id, id),
                eq(recurringTransactions.userId, userId)
            )
        );
}

export async function toggleRecurringTransaction(
    userId: string,
    id: string,
    isActive: boolean
) {
    await db
        .update(recurringTransactions)
        .set({ isActive })
        .where(
            and(
                eq(recurringTransactions.id, id),
                eq(recurringTransactions.userId, userId)
            )
        );
}
