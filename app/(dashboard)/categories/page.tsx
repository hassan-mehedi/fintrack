import { getCategories } from "@/lib/actions/categories";
import type { Category } from "@/lib/types";
import { CategoriesClient } from "./categories-client";

export default async function CategoriesPage() {
  const categories = (await getCategories()) as Category[];

  return <CategoriesClient categories={categories} />;
}
