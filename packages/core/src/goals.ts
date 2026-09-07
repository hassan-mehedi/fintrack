import { db } from "@fintrack/db";
import { financialAccounts, savingsGoals } from "@fintrack/db/schema";
import type { SavingsGoalWithProgress } from "@fintrack/shared/types";
import {
    goalContributionSchema,
    savingsGoalSchema,
} from "@fintrack/shared/validators";
import { and, asc, eq, getTableColumns, sql } from "drizzle-orm";
import { differenceInCalendarMonths, parseISO, startOfDay } from "date-fns";
import { NotFoundError, ValidationError } from "./errors";

export function monthlyNeeded(
    remaining: number,
    deadline: string | null,
    today = new Date()
): number | null {
    if (!deadline) return null;

    const deadlineDate = parseISO(deadline);
    if (deadlineDate < startOfDay(today)) return null;
    if (remaining <= 0) return 0;

    const monthsLeft = Math.max(1, differenceInCalendarMonths(deadlineDate, today));
    return Math.ceil(remaining / monthsLeft);
}

export async function getGoals(userId: string): Promise<SavingsGoalWithProgress[]> {
    const rows = await db
        .select({
            ...getTableColumns(savingsGoals),
            accountName: financialAccounts.name,
            accountBalance: financialAccounts.balance,
        })
        .from(savingsGoals)
        .leftJoin(financialAccounts, eq(savingsGoals.accountId, financialAccounts.id))
        .where(eq(savingsGoals.userId, userId))
        .orderBy(
            sql`${savingsGoals.completedAt} asc nulls first`,
            sql`${savingsGoals.deadline} asc nulls last`,
            asc(savingsGoals.createdAt)
        );

    return rows.map(({ accountBalance, ...goal }) => {
        const target = Number(goal.targetAmount);
        const current =
            goal.accountId && accountBalance !== null
                ? Number(accountBalance)
                : Number(goal.savedAmount);

        return {
            ...goal,
            current,
            percent: target > 0 ? Math.min(100, (current / target) * 100) : 0,
            remaining: Math.max(0, target - current),
        };
    });
}

async function getOwnedGoal(userId: string, id: string) {
    const [goal] = await db
        .select()
        .from(savingsGoals)
        .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
        .limit(1);

    if (!goal) throw new NotFoundError("Goal not found");
    return goal;
}

async function assertAccountOwned(userId: string, accountId: string) {
    const [account] = await db
        .select({ id: financialAccounts.id })
        .from(financialAccounts)
        .where(
            and(
                eq(financialAccounts.id, accountId),
                eq(financialAccounts.userId, userId)
            )
        )
        .limit(1);

    if (!account) throw new NotFoundError("Account not found");
}

export async function createGoal(userId: string, data: unknown) {
    const parsed = savingsGoalSchema.parse(data);
    if (parsed.accountId) await assertAccountOwned(userId, parsed.accountId);

    const [goal] = await db
        .insert(savingsGoals)
        .values({
            userId,
            name: parsed.name,
            icon: parsed.icon,
            color: parsed.color,
            targetAmount: parsed.targetAmount,
            accountId: parsed.accountId || null,
            savedAmount: parsed.savedAmount || "0",
            deadline: parsed.deadline || null,
        })
        .returning();

    return goal;
}

export async function updateGoal(userId: string, id: string, data: unknown) {
    const parsed = savingsGoalSchema.parse(data);
    if (parsed.accountId) await assertAccountOwned(userId, parsed.accountId);

    const [goal] = await db
        .update(savingsGoals)
        .set({
            name: parsed.name,
            icon: parsed.icon,
            color: parsed.color,
            targetAmount: parsed.targetAmount,
            accountId: parsed.accountId || null,
            ...(parsed.savedAmount ? { savedAmount: parsed.savedAmount } : {}),
            deadline: parsed.deadline || null,
            updatedAt: new Date(),
        })
        .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
        .returning();

    if (!goal) throw new NotFoundError("Goal not found");
    return goal;
}

export async function deleteGoal(userId: string, id: string) {
    const deleted = await db
        .delete(savingsGoals)
        .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
        .returning({ id: savingsGoals.id });

    if (deleted.length === 0) throw new NotFoundError("Goal not found");
}

export async function contributeToGoal(userId: string, id: string, data: unknown) {
    const parsed = goalContributionSchema.parse(data);
    const goal = await getOwnedGoal(userId, id);

    if (goal.accountId) {
        throw new ValidationError(
            "This goal tracks a linked account; change the account balance instead"
        );
    }

    const savedAmount = Math.max(0, Number(goal.savedAmount) + Number(parsed.amount));

    const [updated] = await db
        .update(savingsGoals)
        .set({ savedAmount: savedAmount.toFixed(2), updatedAt: new Date() })
        .where(eq(savingsGoals.id, goal.id))
        .returning();

    return updated;
}

export async function setGoalCompleted(userId: string, id: string, completed: boolean) {
    const [goal] = await db
        .update(savingsGoals)
        .set({ completedAt: completed ? new Date() : null, updatedAt: new Date() })
        .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId)))
        .returning();

    if (!goal) throw new NotFoundError("Goal not found");
    return goal;
}
