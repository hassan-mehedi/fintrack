import { getDashboardData } from "@/lib/actions/dashboard";
import {
  getMonthAnalytics,
  getSubscriptionCandidates,
  getYearOverview,
} from "@/lib/actions/analytics";
import { AnalyticsClient } from "./analytics-client";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; year?: string }>;
}) {
  const params = await searchParams;
  const range = { from: params.from, to: params.to };
  const requestedYear = Number(params.year);
  const selectedYear =
    Number.isInteger(requestedYear) && requestedYear >= 2000
      ? requestedYear
      : new Date().getFullYear();

  const [data, analytics, year, subscriptions] = await Promise.all([
    getDashboardData(range),
    getMonthAnalytics(range),
    getYearOverview(selectedYear),
    getSubscriptionCandidates(),
  ]);

  return (
    <AnalyticsClient
      data={data}
      analytics={analytics}
      year={year}
      subscriptions={subscriptions}
    />
  );
}
