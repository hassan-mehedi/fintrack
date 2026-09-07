import { cache } from "react";
import { getDashboardData } from "@/lib/actions/dashboard";
import {
  getMonthAnalytics,
  getSubscriptionCandidates,
  getYearOverview,
} from "@/lib/actions/analytics";

// Shared across the page's sections for one request, so each section
// awaits the same promise instead of refetching.
// Anomalies are shown from the month analytics, so the dashboard call
// skips computing its own copy.
export const loadDashboard = cache((from: string, to: string) =>
  getDashboardData({ from, to, anomalies: [] })
);

export const loadAnalytics = cache((from: string, to: string) =>
  getMonthAnalytics({ from, to })
);

export const loadYear = cache((year: number) => getYearOverview(year));

export const loadSubscriptions = cache(() => getSubscriptionCandidates());
