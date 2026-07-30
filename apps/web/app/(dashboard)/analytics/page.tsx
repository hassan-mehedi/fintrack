import { getDashboardData } from "@/lib/actions/dashboard";
import { AnalyticsClient } from "./analytics-client";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const data = await getDashboardData({
    from: params.from,
    to: params.to,
  });

  return <AnalyticsClient data={data} />;
}
