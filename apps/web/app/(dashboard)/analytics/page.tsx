import { Suspense } from "react";
import { DateRangePicker } from "@/components/layout/date-range-picker";
import {
  BlockSkeleton,
  ChartPairSkeleton,
  ChartSkeleton,
  StatCardsSkeleton,
} from "@/components/dashboard/skeletons";
import { resolveDateRange } from "../dashboard/data";
import {
  CategoryChartsSection,
  MonthInsightsSection,
  SubscriptionsSection,
  SummaryStatsSection,
  TopCategoriesSection,
  TrendsSection,
  YearSection,
} from "./sections";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; year?: string }>;
}) {
  const params = await searchParams;
  const { from, to } = resolveDateRange(params);
  const requestedYear = Number(params.year);
  const selectedYear =
    Number.isInteger(requestedYear) && requestedYear >= 2000
      ? requestedYear
      : new Date().getFullYear();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Detailed financial insights</p>
        </div>
        <Suspense fallback={null}>
          <DateRangePicker />
        </Suspense>
      </div>

      <Suspense fallback={<StatCardsSkeleton />}>
        <SummaryStatsSection from={from} to={to} />
      </Suspense>

      <Suspense
        fallback={
          <>
            <BlockSkeleton className="h-[200px]" />
            <ChartPairSkeleton />
          </>
        }
      >
        <MonthInsightsSection from={from} to={to} />
      </Suspense>

      <Suspense fallback={<ChartPairSkeleton />}>
        <CategoryChartsSection from={from} to={to} />
      </Suspense>

      <Suspense
        fallback={
          <>
            <ChartPairSkeleton />
            <ChartPairSkeleton />
          </>
        }
      >
        <TrendsSection from={from} to={to} />
      </Suspense>

      <Suspense fallback={<BlockSkeleton className="h-[200px]" />}>
        <SubscriptionsSection />
      </Suspense>

      <Suspense fallback={<ChartSkeleton />}>
        <YearSection year={selectedYear} />
      </Suspense>

      <Suspense fallback={<BlockSkeleton className="h-[300px]" />}>
        <TopCategoriesSection from={from} to={to} />
      </Suspense>
    </div>
  );
}
