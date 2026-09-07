import { db } from "@fintrack/db";
import { users } from "@fintrack/db/schema";
import { checkBudgetAlerts } from "./budget-alerts";
import { computeNetWorth } from "./dashboard";
import { recordNetWorthSnapshot } from "./net-worth";
import {
    getUserIdsWithActiveRecurring,
    processRecurringForUser,
} from "./recurring-processor";
import { sendRecurringReminders } from "./reminders";

export type JobStep = "recurring" | "budgetAlerts" | "snapshots" | "reminders";

export interface JobsReport {
    recurring: {
        users: number;
        created: number;
        failures: { userId: string; error: string }[];
    };
    budgetAlerts: {
        sent: number;
        failures: { budgetId: string; threshold: number; error: string }[];
    };
    snapshots: {
        users: number;
        failures: { userId: string; error: string }[];
    };
    reminders: {
        sent: number;
        failures: { recurringId: string; error: string }[];
    };
    // A step that threw before producing its own result lands here
    errors: { step: JobStep; error: string }[];
    durationMs: number;
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function runRecurring(): Promise<JobsReport["recurring"]> {
    const userIds = await getUserIdsWithActiveRecurring();
    const result: JobsReport["recurring"] = {
        users: userIds.length,
        created: 0,
        failures: [],
    };
    for (const userId of userIds) {
        try {
            const { created } = await processRecurringForUser(userId);
            result.created += created;
        } catch (error) {
            result.failures.push({ userId, error: describeError(error) });
        }
    }
    return result;
}

async function runBudgetAlerts(): Promise<JobsReport["budgetAlerts"]> {
    const { sent, failures } = await checkBudgetAlerts();
    return {
        sent,
        failures: failures.map((f) => ({ ...f, error: describeError(f.error) })),
    };
}

async function runSnapshots(): Promise<JobsReport["snapshots"]> {
    const rows = await db.select({ id: users.id }).from(users);
    const result: JobsReport["snapshots"] = { users: rows.length, failures: [] };
    for (const { id: userId } of rows) {
        try {
            await recordNetWorthSnapshot(userId, await computeNetWorth(userId));
        } catch (error) {
            result.failures.push({ userId, error: describeError(error) });
        }
    }
    return result;
}

async function runReminders(): Promise<JobsReport["reminders"]> {
    const { sent, failures } = await sendRecurringReminders();
    return {
        sent,
        failures: failures.map((f) => ({ ...f, error: describeError(f.error) })),
    };
}

// Every step is idempotent for a given day, so running this more than once
// a day is safe. Steps run in order; a failing step does not stop the rest.
export async function runScheduledJobs(): Promise<JobsReport> {
    const start = Date.now();
    const report: JobsReport = {
        recurring: { users: 0, created: 0, failures: [] },
        budgetAlerts: { sent: 0, failures: [] },
        snapshots: { users: 0, failures: [] },
        reminders: { sent: 0, failures: [] },
        errors: [],
        durationMs: 0,
    };

    const steps: { [K in JobStep]: () => Promise<JobsReport[K]> } = {
        recurring: runRecurring,
        budgetAlerts: runBudgetAlerts,
        snapshots: runSnapshots,
        reminders: runReminders,
    };

    for (const step of Object.keys(steps) as JobStep[]) {
        try {
            Object.assign(report, { [step]: await steps[step]() });
        } catch (error) {
            report.errors.push({ step, error: describeError(error) });
        }
    }

    report.durationMs = Date.now() - start;
    return report;
}
