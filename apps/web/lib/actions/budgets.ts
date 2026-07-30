"use server";

import { revalidatePath } from "next/cache";
import * as budgets from "@fintrack/core/budgets";
import { requireUserId } from "@/lib/action-session";

export async function getBudgets(month: number, year: number) {
    const userId = await requireUserId();
    return budgets.getBudgets(userId, month, year);
}

export async function createBudget(data: unknown) {
    const userId = await requireUserId();
    const budget = await budgets.createBudget(userId, data);

    revalidatePath("/budgets");
    return budget;
}

export async function deleteBudget(id: string) {
    const userId = await requireUserId();
    await budgets.deleteBudget(userId, id);

    revalidatePath("/budgets");
}
