import {
  AnomaliesCard,
  MonthReviewCard,
  SubscriptionsCard,
} from "@/components/analytics/insight-cards";
import {
  AnalyticsSummary,
  CategoryCharts,
  DailySpendCharts,
  TopSpendingCategories,
  TrendCharts,
  YearOverviewSection,
} from "./analytics-client";
import {
  loadAnalytics,
  loadDashboard,
  loadSubscriptions,
  loadYear,
} from "./data";

interface RangeProps {
  from: string;
  to: string;
}

export async function SummaryStatsSection({ from, to }: RangeProps) {
  const data = await loadDashboard(from, to);
  return <AnalyticsSummary data={data} from={from} to={to} />;
}

export async function MonthInsightsSection({ from, to }: RangeProps) {
  const analytics = await loadAnalytics(from, to);
  return (
    <>
      <MonthReviewCard review={analytics.monthReview} />
      <AnomaliesCard anomalies={analytics.anomalies} />
      <DailySpendCharts analytics={analytics} rangeStart={from} />
    </>
  );
}

export async function CategoryChartsSection({ from, to }: RangeProps) {
  const data = await loadDashboard(from, to);
  return <CategoryCharts data={data} from={from} to={to} />;
}

export async function TrendsSection({ from, to }: RangeProps) {
  const analytics = await loadAnalytics(from, to);
  return <TrendCharts analytics={analytics} />;
}

export async function SubscriptionsSection() {
  const subscriptions = await loadSubscriptions();
  return <SubscriptionsCard subscriptions={subscriptions} />;
}

export async function YearSection({ year }: { year: number }) {
  const overview = await loadYear(year);
  return <YearOverviewSection overview={overview} />;
}

export async function TopCategoriesSection({ from, to }: RangeProps) {
  const data = await loadDashboard(from, to);
  return <TopSpendingCategories data={data} />;
}
