"use server";

import * as dashboard from "@fintrack/core/dashboard";
import { requireUserId } from "@/lib/action-session";

export async function getDashboardData(options?: { from?: string; to?: string }) {
    const userId = await requireUserId();
    return dashboard.getDashboardData(userId, options);
}
