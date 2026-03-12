"use server";

import { db } from "@/lib/db";
import { transactions, categories, financialAccounts } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and, desc, gte, lte, ilike } from "drizzle-orm";

export async function exportTransactionsCSV(filters?: {
  type?: string;
  categoryId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const conditions = [eq(transactions.userId, session.user.id)];

  if (filters?.type) {
    conditions.push(
      eq(transactions.type, filters.type as "income" | "expense" | "transfer")
    );
  }
  if (filters?.categoryId) {
    conditions.push(eq(transactions.categoryId, filters.categoryId));
  }
  if (filters?.startDate) {
    conditions.push(gte(transactions.date, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(transactions.date, filters.endDate));
  }
  if (filters?.search) {
    conditions.push(ilike(transactions.description, `%${filters.search}%`));
  }

  const data = await db
    .select({
      date: transactions.date,
      type: transactions.type,
      description: transactions.description,
      amount: transactions.amount,
      fee: transactions.fee,
      categoryName: categories.name,
      accountName: financialAccounts.name,
      tags: transactions.tags,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .innerJoin(
      financialAccounts,
      eq(transactions.accountId, financialAccounts.id)
    )
    .where(and(...conditions))
    .orderBy(desc(transactions.date), desc(transactions.createdAt));

  // Build CSV
  const headers = ["Date", "Type", "Description", "Category", "Account", "Amount", "Fee", "Tags"];
  const rows = data.map((t) => [
    t.date,
    t.type,
    `"${(t.description || "").replace(/"/g, '""')}"`,
    `"${t.categoryName}"`,
    `"${t.accountName}"`,
    t.amount,
    t.fee,
    `"${(t.tags || []).join(", ")}"`,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  return csv;
}
