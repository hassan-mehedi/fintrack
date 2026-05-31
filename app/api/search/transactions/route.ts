import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  transactions,
  financialAccounts,
  categories,
  merchants,
} from "@/lib/db/schema";
import { and, eq, gte, lte, ilike, isNull, sql, desc } from "drizzle-orm";
import { parseNaturalLanguageQuery } from "@/lib/insights/nl-search";
import { z } from "zod";
import { format } from "date-fns";
import { chatLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const limit = await chatLimiter(session.user.id);
  if (!limit.success) {
    return Response.json(
      { error: "Rate limit exceeded", retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    );
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const today = format(new Date(), "yyyy-MM-dd");
  const filter = await parseNaturalLanguageQuery(parsed.query, today);
  if (!filter) {
    return Response.json({ filter: null, transactions: [], total: 0 });
  }

  const conditions = [
    eq(transactions.userId, session.user.id),
    isNull(transactions.deletedAt),
    isNull(transactions.parentId),
  ];

  if (filter.type) conditions.push(eq(transactions.type, filter.type));
  if (filter.startDate) conditions.push(gte(transactions.date, filter.startDate));
  if (filter.endDate) conditions.push(lte(transactions.date, filter.endDate));
  if (filter.minAmount != null)
    conditions.push(gte(transactions.amount, String(filter.minAmount)));
  if (filter.maxAmount != null)
    conditions.push(lte(transactions.amount, String(filter.maxAmount)));
  if (filter.search) conditions.push(ilike(transactions.description, `%${filter.search}%`));
  if (filter.accountName)
    conditions.push(ilike(financialAccounts.name, `%${filter.accountName}%`));
  if (filter.categoryName)
    conditions.push(ilike(categories.name, `%${filter.categoryName}%`));
  if (filter.merchant)
    conditions.push(
      sql`(${transactions.merchantId} IS NULL OR ${merchants.name} ILIKE ${`%${filter.merchant}%`})`,
    );

  const rows = await db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      fee: transactions.fee,
      type: transactions.type,
      status: transactions.status,
      description: transactions.description,
      date: transactions.date,
      tags: transactions.tags,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      accountId: transactions.accountId,
      accountName: financialAccounts.name,
      toAccountId: transactions.toAccountId,
      merchantId: transactions.merchantId,
      merchantName: merchants.name,
      isReimbursable: transactions.isReimbursable,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .innerJoin(
      financialAccounts,
      eq(transactions.accountId, financialAccounts.id),
    )
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(and(...conditions))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(parsed.limit ?? 50);

  return Response.json({
    filter,
    transactions: rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      fee: Number(r.fee),
    })),
    total: rows.length,
  });
}
