import { db } from "@fintrack/db";
import { categories } from "@fintrack/db/schema";
import { categorySchema } from "@fintrack/shared/validators";
import { and, eq, or } from "drizzle-orm";

export async function getCategories(
    userId: string,
    type?: "income" | "expense" | "both"
) {
    return db
        .select()
        .from(categories)
        .where(
            and(
                eq(categories.userId, userId),
                type
                    ? or(eq(categories.type, type), eq(categories.type, "both"))
                    : undefined
            )
        );
}

export async function createCategory(userId: string, data: unknown) {
    const parsed = categorySchema.parse(data);

    const [category] = await db
        .insert(categories)
        .values({
            userId,
            name: parsed.name,
            icon: parsed.icon,
            color: parsed.color,
            type: parsed.type,
            isDefault: false,
        })
        .returning();

    return category;
}

export async function updateCategory(userId: string, id: string, data: unknown) {
    const parsed = categorySchema.parse(data);

    const [category] = await db
        .update(categories)
        .set({
            name: parsed.name,
            icon: parsed.icon,
            color: parsed.color,
            type: parsed.type,
        })
        .where(and(eq(categories.id, id), eq(categories.userId, userId)))
        .returning();

    return category;
}

export async function deleteCategory(userId: string, id: string) {
    await db
        .delete(categories)
        .where(and(eq(categories.id, id), eq(categories.userId, userId)));
}
