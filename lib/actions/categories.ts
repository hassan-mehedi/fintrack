"use server";

import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { categorySchema } from "@/lib/validators";
import { revalidatePath } from "next/cache";

export async function getCategories(type?: "income" | "expense" | "both") {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const allCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, session.user.id));

  if (!type) return allCategories;

  return allCategories.filter(
    (cat) => cat.type === type || cat.type === "both"
  );
}

export async function createCategory(data: unknown) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = categorySchema.parse(data);

  const [category] = await db
    .insert(categories)
    .values({
      userId: session.user.id,
      name: parsed.name,
      icon: parsed.icon,
      color: parsed.color,
      type: parsed.type,
      isDefault: false,
    })
    .returning();

  revalidatePath("/categories");
  return category;
}

export async function updateCategory(id: string, data: unknown) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = categorySchema.parse(data);

  const [category] = await db
    .update(categories)
    .set({
      name: parsed.name,
      icon: parsed.icon,
      color: parsed.color,
      type: parsed.type,
    })
    .where(
      and(eq(categories.id, id), eq(categories.userId, session.user.id))
    )
    .returning();

  revalidatePath("/categories");
  return category;
}

export async function deleteCategory(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db
    .delete(categories)
    .where(
      and(eq(categories.id, id), eq(categories.userId, session.user.id))
    );

  revalidatePath("/categories");
}
