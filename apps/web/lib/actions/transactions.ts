"use server";

import { revalidatePath } from "next/cache";
import * as transactions from "@fintrack/core/transactions";
import type { TransactionFilters } from "@fintrack/core/transactions";
import { requireUserId } from "@/lib/action-session";

export async function getTransactions(filters?: TransactionFilters) {
    const userId = await requireUserId();
    return transactions.getTransactions(userId, filters);
}

export async function createTransaction(data: unknown) {
    const userId = await requireUserId();
    const inserted = await transactions.createTransaction(userId, data);

    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    return inserted;
}

export async function updateTransaction(id: string, data: unknown) {
    const userId = await requireUserId();
    const updated = await transactions.updateTransaction(userId, id, data);

    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
    return updated;
}

export async function deleteTransaction(id: string) {
    const userId = await requireUserId();
    await transactions.deleteTransaction(userId, id);

    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/accounts");
}
