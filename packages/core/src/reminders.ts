import { db } from "@fintrack/db";
import {
    categories,
    recurringReminders,
    recurringTransactions,
    users,
} from "@fintrack/db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { getCurrencyInfo } from "@fintrack/shared/currencies";
import { sendEmail, isEmailConfigured, renderEmail } from "./email";
import { getNextDueDate } from "./recurring-processor";

export interface ReminderResult {
    sent: number;
    failures: { recurringId: string; error: unknown }[];
}

export function shouldRemind(dueDate: string, reminderDays: number, today: Date): boolean {
    const daysUntilDue = differenceInCalendarDays(parseISO(dueDate), today);
    return daysUntilDue >= 0 && daysUntilDue <= reminderDays;
}

const amountFormat = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
});

export async function sendRecurringReminders(today = new Date()): Promise<ReminderResult> {
    if (!isEmailConfigured()) return { sent: 0, failures: [] };

    const rules = await db
        .select({
            id: recurringTransactions.id,
            accountId: recurringTransactions.accountId,
            categoryId: recurringTransactions.categoryId,
            amount: recurringTransactions.amount,
            fee: recurringTransactions.fee,
            type: recurringTransactions.type,
            description: recurringTransactions.description,
            frequency: recurringTransactions.frequency,
            startDate: recurringTransactions.startDate,
            endDate: recurringTransactions.endDate,
            lastProcessed: recurringTransactions.lastProcessed,
            isActive: recurringTransactions.isActive,
            tags: recurringTransactions.tags,
            reminderDays: recurringTransactions.reminderDays,
            categoryName: categories.name,
            userName: users.name,
            userEmail: users.email,
            userCurrency: users.currency,
        })
        .from(recurringTransactions)
        .innerJoin(categories, eq(recurringTransactions.categoryId, categories.id))
        .innerJoin(users, eq(recurringTransactions.userId, users.id))
        .where(
            and(
                eq(recurringTransactions.isActive, true),
                isNotNull(recurringTransactions.reminderDays)
            )
        );

    const candidates = rules.flatMap((rule) => {
        if (rule.reminderDays === null) return [];
        const dueDate = getNextDueDate(rule, today);
        if (!dueDate || !shouldRemind(dueDate, rule.reminderDays, today)) return [];
        return [{ rule, dueDate }];
    });

    if (candidates.length === 0) return { sent: 0, failures: [] };

    const sentRows = await db
        .select({
            recurringId: recurringReminders.recurringId,
            dueDate: recurringReminders.dueDate,
        })
        .from(recurringReminders)
        .where(
            inArray(
                recurringReminders.recurringId,
                candidates.map((c) => c.rule.id)
            )
        );
    const alreadySent = new Set(sentRows.map((r) => `${r.recurringId}:${r.dueDate}`));

    const result: ReminderResult = { sent: 0, failures: [] };

    for (const { rule, dueDate } of candidates) {
        if (alreadySent.has(`${rule.id}:${dueDate}`)) continue;

        const currency = getCurrencyInfo(rule.userCurrency ?? "BDT");
        const amount = `${currency.symbol}${amountFormat.format(Number(rule.amount))}`;
        const due = parseISO(dueDate);
        const heading = rule.type === "income" ? "Upcoming income" : "Upcoming payment";
        const summary = `${rule.description} for ${amount} (${rule.categoryName}) is due on ${format(due, "d MMM yyyy")}.`;

        try {
            await sendEmail({
                to: rule.userEmail,
                subject: `Upcoming: ${rule.description} (${amount}) due ${format(due, "d MMM")}`,
                ...renderEmail(heading, rule.userName, [summary, "Open FinTrack to review."]),
            });
            await db
                .insert(recurringReminders)
                .values({ recurringId: rule.id, dueDate })
                .onConflictDoNothing();
            result.sent++;
        } catch (error) {
            result.failures.push({ recurringId: rule.id, error });
        }
    }

    return result;
}
