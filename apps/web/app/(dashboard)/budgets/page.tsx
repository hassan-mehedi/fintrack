import { getBudgets } from "@/lib/actions/budgets";
import { getCategories } from "@/lib/actions/categories";
import type { Category } from "@fintrack/shared/types";
import { BudgetsClient } from "./budgets-client";

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const params = await searchParams;

  const now = new Date();
  const month = params.from
    ? new Date(params.from).getMonth() + 1
    : now.getMonth() + 1;
  const year = params.from
    ? new Date(params.from).getFullYear()
    : now.getFullYear();

  const [budgets, categories] = await Promise.all([
    getBudgets(month, year),
    getCategories("expense"),
  ]);

  return (
    <BudgetsClient
      initialBudgets={budgets}
      initialCategories={categories as Category[]}
      initialMonth={month}
      initialYear={year}
    />
  );
}
