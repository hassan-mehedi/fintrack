"use server";

import * as dashboard from "@fintrack/core/dashboard";
import * as netWorth from "@fintrack/core/net-worth";
import { requireUserId } from "@/lib/action-session";

export async function getDashboardData(options?: { from?: string; to?: string }) {
    const userId = await requireUserId();
    return dashboard.getDashboardData(userId, options);
}

export async function getNetWorthHistory(months = 6) {
    const userId = await requireUserId();
    return netWorth.getNetWorthHistory(userId, months);
}
