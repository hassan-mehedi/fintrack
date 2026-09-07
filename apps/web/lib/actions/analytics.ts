"use server";

import * as analytics from "@fintrack/core/analytics";
import { requireUserId } from "@/lib/action-session";

export async function getMonthAnalytics(options?: {
    from?: string;
    to?: string;
    anomalies?: analytics.SpendingAnomaly[];
}) {
    const userId = await requireUserId();
    return analytics.getMonthAnalytics(userId, options);
}

export async function getYearOverview(year?: number) {
    const userId = await requireUserId();
    return analytics.getYearOverview(userId, year ?? new Date().getFullYear());
}

export async function getSubscriptionCandidates() {
    const userId = await requireUserId();
    return analytics.getSubscriptionCandidates(userId);
}
