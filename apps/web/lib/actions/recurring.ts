"use server";

import { revalidatePath } from "next/cache";
import * as recurring from "@fintrack/core/recurring";
import { processRecurringForUser } from "@fintrack/core/recurring-processor";
import { requireUserId } from "@/lib/action-session";

export async function getRecurringTransactions() {
    const userId = await requireUserId();
    return recurring.getRecurringTransactions(userId);
}

export async function createRecurringTransaction(data: unknown) {
    const userId = await requireUserId();
    const result = await recurring.createRecurringTransaction(userId, data);

    revalidatePath("/recurring");
    return result;
}

export async function updateRecurringTransaction(id: string, data: unknown) {
    const userId = await requireUserId();
    await recurring.updateRecurringTransaction(userId, id, data);

    revalidatePath("/recurring");
}

export async function deleteRecurringTransaction(id: string) {
    const userId = await requireUserId();
    await recurring.deleteRecurringTransaction(userId, id);

    revalidatePath("/recurring");
}

export async function toggleRecurringTransaction(id: string, isActive: boolean) {
    const userId = await requireUserId();
    await recurring.toggleRecurringTransaction(userId, id, isActive);

    revalidatePath("/recurring");
}

export async function processRecurringTransactions() {
    const userId = await requireUserId();
    const result = await processRecurringForUser(userId);

    if (result.created > 0) {
        revalidatePath("/");
        revalidatePath("/transactions");
        revalidatePath("/accounts");
        revalidatePath("/recurring");
    }

    return result;
}
