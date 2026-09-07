"use server";

import { revalidatePath } from "next/cache";
import * as budgets from "@fintrack/core/budgets";
import { requireUserId } from "@/lib/action-session";

const AFFECTED_PATHS = ["/budgets", "/dashboard", "/analytics"];

function revalidateBudgetPages() {
    AFFECTED_PATHS.forEach((path) => revalidatePath(path));
}

export async function getBudgets(month: number, year: number) {
    const userId = await requireUserId();
    return budgets.getBudgets(userId, month, year);
}

export async function createBudget(data: unknown) {
    const userId = await requireUserId();
    const budget = await budgets.createBudget(userId, data);

    revalidateBudgetPages();
    return budget;
}

export async function copyBudgetsFromPreviousMonth(month: number, year: number) {
    const userId = await requireUserId();
    const result = await budgets.copyBudgetsFromPreviousMonth(userId, month, year);

    revalidateBudgetPages();
    return result;
}

export async function deleteBudget(id: string) {
    const userId = await requireUserId();
    await budgets.deleteBudget(userId, id);

    revalidateBudgetPages();
}
