"use server";

import { revalidatePath } from "next/cache";
import * as transactions from "@fintrack/core/transactions";
import type { TransactionFilters } from "@fintrack/core/transactions";
import { requireUserId } from "@/lib/action-session";

const AFFECTED_PATHS = ["/dashboard", "/transactions", "/accounts", "/analytics", "/budgets"];

function revalidateTransactionPages() {
    AFFECTED_PATHS.forEach((path) => revalidatePath(path));
}

export async function getTransactions(filters?: TransactionFilters) {
    const userId = await requireUserId();
    return transactions.getTransactions(userId, filters);
}

export async function createTransaction(data: unknown) {
    const userId = await requireUserId();
    const inserted = await transactions.createTransaction(userId, data);

    revalidateTransactionPages();
    return inserted;
}

export async function updateTransaction(id: string, data: unknown) {
    const userId = await requireUserId();
    const updated = await transactions.updateTransaction(userId, id, data);

    revalidateTransactionPages();
    return updated;
}

export async function deleteTransaction(id: string) {
    const userId = await requireUserId();
    await transactions.deleteTransaction(userId, id);

    revalidateTransactionPages();
}

export async function deleteTransactions(ids: string[]) {
    const userId = await requireUserId();
    await transactions.deleteTransactions(userId, ids);

    revalidateTransactionPages();
}

export async function updateTransactionsCategory(ids: string[], categoryId: string) {
    const userId = await requireUserId();
    await transactions.updateTransactionsCategory(userId, ids, categoryId);

    revalidateTransactionPages();
}
