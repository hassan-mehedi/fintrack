import { db } from "@fintrack/db";
import { netWorthSnapshots } from "@fintrack/db/schema";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { format, subMonths } from "date-fns";

interface SnapshotValues {
    netWorth: number;
    totalAssets: number;
    totalLiabilities: number;
}

export async function recordNetWorthSnapshot(
    userId: string,
    values: SnapshotValues
) {
    const today = format(new Date(), "yyyy-MM-dd");

    await db
        .insert(netWorthSnapshots)
        .values({
            userId,
            date: today,
            netWorth: values.netWorth.toFixed(2),
            totalAssets: values.totalAssets.toFixed(2),
            totalLiabilities: values.totalLiabilities.toFixed(2),
        })
        .onConflictDoUpdate({
            target: [netWorthSnapshots.userId, netWorthSnapshots.date],
            set: {
                netWorth: sql`excluded.net_worth`,
                totalAssets: sql`excluded.total_assets`,
                totalLiabilities: sql`excluded.total_liabilities`,
            },
        });
}

export async function getNetWorthHistory(userId: string, months = 6) {
    const start = format(subMonths(new Date(), months), "yyyy-MM-dd");

    const rows = await db
        .select({
            date: netWorthSnapshots.date,
            netWorth: netWorthSnapshots.netWorth,
            totalAssets: netWorthSnapshots.totalAssets,
            totalLiabilities: netWorthSnapshots.totalLiabilities,
        })
        .from(netWorthSnapshots)
        .where(
            and(
                eq(netWorthSnapshots.userId, userId),
                gte(netWorthSnapshots.date, start)
            )
        )
        .orderBy(asc(netWorthSnapshots.date));

    return rows.map((row) => ({
        date: row.date,
        netWorth: Number(row.netWorth),
        totalAssets: Number(row.totalAssets),
        totalLiabilities: Number(row.totalLiabilities),
    }));
}
