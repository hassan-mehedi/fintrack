"use server";

import { revalidatePath } from "next/cache";
import * as goals from "@fintrack/core/goals";
import { requireUserId } from "@/lib/action-session";

const AFFECTED_PATHS = ["/goals", "/dashboard"];

function revalidateGoalPages() {
    AFFECTED_PATHS.forEach((path) => revalidatePath(path));
}

export async function getGoals() {
    const userId = await requireUserId();
    return goals.getGoals(userId);
}

export async function createGoal(data: unknown) {
    const userId = await requireUserId();
    const goal = await goals.createGoal(userId, data);

    revalidateGoalPages();
    return goal;
}

export async function updateGoal(id: string, data: unknown) {
    const userId = await requireUserId();
    const goal = await goals.updateGoal(userId, id, data);

    revalidateGoalPages();
    return goal;
}

export async function deleteGoal(id: string) {
    const userId = await requireUserId();
    await goals.deleteGoal(userId, id);

    revalidateGoalPages();
}

export async function contributeToGoal(id: string, data: unknown) {
    const userId = await requireUserId();
    const goal = await goals.contributeToGoal(userId, id, data);

    revalidateGoalPages();
    return goal;
}

export async function setGoalCompleted(id: string, completed: boolean) {
    const userId = await requireUserId();
    const goal = await goals.setGoalCompleted(userId, id, completed);

    revalidateGoalPages();
    return goal;
}
