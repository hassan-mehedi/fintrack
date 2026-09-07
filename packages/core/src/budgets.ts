import { db } from "@fintrack/db";
import { budgets, categories, transactions } from "@fintrack/db/schema";
import { budgetSchema } from "@fintrack/shared/validators";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { categorySpend } from "./analytics";

export async function getBudgets(userId: string, month: number, year: number) {
    const dateStart = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
    const dateEnd = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");

    // Spend is split-aware: a split transaction counts against its splits'
    // categories, not its own (see categorySpend)
    const spend = categorySpend(
        and(
            eq(transactions.userId, userId),
            eq(transactions.type, "expense"),
            gte(transactions.date, dateStart),
            lte(transactions.date, dateEnd)
        )
    );

    // Budgets and spending are independent — fetch them together
    const [budgetData, spending] = await db.batch([
        db
            .select({
                id: budgets.id,
                amount: budgets.amount,
                month: budgets.month,
                year: budgets.year,
                categoryId: budgets.categoryId,
                categoryName: categories.name,
                categoryIcon: categories.icon,
                categoryColor: categories.color,
            })
            .from(budgets)
            .innerJoin(categories, eq(budgets.categoryId, categories.id))
            .where(
                and(
                    eq(budgets.userId, userId),
                    eq(budgets.month, month),
                    eq(budgets.year, year)
                )
            ),

        db
            .select({
                categoryId: spend.categoryId,
                spent: sql<string>`SUM(${spend.amount})`,
            })
            .from(spend)
            .groupBy(spend.categoryId),
    ]);

    const spendingMap = new Map(spending.map((s) => [s.categoryId, Number(s.spent)]));

    return budgetData.map((b) => ({
        ...b,
        budgetAmount: Number(b.amount),
        spent: spendingMap.get(b.categoryId) || 0,
    }));
}

export async function createBudget(userId: string, data: unknown) {
    const parsed = budgetSchema.parse(data);

    const existing = await db
        .select()
        .from(budgets)
        .where(
            and(
                eq(budgets.userId, userId),
                eq(budgets.categoryId, parsed.categoryId),
                eq(budgets.month, parsed.month),
                eq(budgets.year, parsed.year)
            )
        )
        .limit(1);

    if (existing.length > 0) {
        const [budget] = await db
            .update(budgets)
            .set({ amount: parsed.amount })
            .where(eq(budgets.id, existing[0].id))
            .returning();
        return budget;
    }

    const [budget] = await db
        .insert(budgets)
        .values({
            userId,
            categoryId: parsed.categoryId,
            amount: parsed.amount,
            month: parsed.month,
            year: parsed.year,
        })
        .returning();

    return budget;
}

export async function copyBudgetsFromPreviousMonth(
    userId: string,
    month: number,
    year: number
) {
    const previousMonth = month === 1 ? 12 : month - 1;
    const previousYear = month === 1 ? year - 1 : year;

    const [previous, current] = await Promise.all([
        db
            .select({ categoryId: budgets.categoryId, amount: budgets.amount })
            .from(budgets)
            .where(
                and(
                    eq(budgets.userId, userId),
                    eq(budgets.month, previousMonth),
                    eq(budgets.year, previousYear)
                )
            ),
        db
            .select({ categoryId: budgets.categoryId })
            .from(budgets)
            .where(
                and(
                    eq(budgets.userId, userId),
                    eq(budgets.month, month),
                    eq(budgets.year, year)
                )
            ),
    ]);

    const alreadyBudgeted = new Set(current.map((b) => b.categoryId));
    const toCopy = previous.filter((b) => !alreadyBudgeted.has(b.categoryId));

    if (toCopy.length === 0) {
        return { copied: 0 };
    }

    await db.insert(budgets).values(
        toCopy.map((b) => ({
            userId,
            categoryId: b.categoryId,
            amount: b.amount,
            month,
            year,
        }))
    );

    return { copied: toCopy.length };
}

export async function deleteBudget(userId: string, id: string) {
    await db
        .delete(budgets)
        .where(and(eq(budgets.id, id), eq(budgets.userId, userId)));
}
