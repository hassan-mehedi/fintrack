"use server";

import { revalidatePath } from "next/cache";
import * as categories from "@fintrack/core/categories";
import { requireUserId } from "@/lib/action-session";

export async function getCategories(type?: "income" | "expense" | "both") {
    const userId = await requireUserId();
    return categories.getCategories(userId, type);
}

export async function createCategory(data: unknown) {
    const userId = await requireUserId();
    const category = await categories.createCategory(userId, data);

    revalidatePath("/categories");
    return category;
}

export async function updateCategory(id: string, data: unknown) {
    const userId = await requireUserId();
    const category = await categories.updateCategory(userId, id, data);

    revalidatePath("/categories");
    return category;
}

export async function deleteCategory(id: string) {
    const userId = await requireUserId();
    await categories.deleteCategory(userId, id);

    revalidatePath("/categories");
}
