import { cache } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { getDashboardData, getNetWorthHistory } from "@/lib/actions/dashboard";

export function resolveDateRange(params: { from?: string; to?: string }) {
  const now = new Date();
  return {
    from: params.from || format(startOfMonth(now), "yyyy-MM-dd"),
    to: params.to || format(endOfMonth(now), "yyyy-MM-dd"),
  };
}

// Shared across the page's sections for one request, so each section
// awaits the same promise instead of refetching
export const loadDashboard = cache((from: string, to: string) =>
  getDashboardData({ from, to })
);

export const loadNetWorthHistory = cache(() => getNetWorthHistory(6));
