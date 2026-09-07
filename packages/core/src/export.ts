import { db } from "@fintrack/db";
import {
    categories,
    financialAccounts,
    transactions,
} from "@fintrack/db/schema";
import { and, arrayOverlaps, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { getSplitsForTransactions } from "./splits";

export interface ExportFilters {
    type?: string;
    categoryId?: string;
    accountId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    tags?: string[];
}

function csvCell(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
}

export async function exportTransactionsCSV(userId: string, filters?: ExportFilters) {
    const conditions = [eq(transactions.userId, userId)];

    if (filters?.type) {
        conditions.push(
            eq(transactions.type, filters.type as "income" | "expense" | "transfer")
        );
    }
    if (filters?.categoryId) {
        conditions.push(eq(transactions.categoryId, filters.categoryId));
    }
    if (filters?.accountId) {
        conditions.push(eq(transactions.accountId, filters.accountId));
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
    if (filters?.tags?.length) {
        conditions.push(arrayOverlaps(transactions.tags, filters.tags));
    }

    const data = await db
        .select({
            id: transactions.id,
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

    const splits = await getSplitsForTransactions(data.map((t) => t.id));

    const headers = [
        "Date",
        "Type",
        "Description",
        "Category",
        "Account",
        "Amount",
        "Fee",
        "Tags",
        "Splits",
    ];
    const rows = data.map((t) => [
        t.date,
        t.type,
        csvCell(t.description || ""),
        csvCell(t.categoryName),
        csvCell(t.accountName),
        t.amount,
        t.fee,
        csvCell((t.tags || []).join(", ")),
        csvCell(
            (splits.get(t.id) ?? [])
                .map((s) => `${s.category.name} ${s.amount}`)
                .join("; ")
        ),
    ]);

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
