import { Suspense } from "react";
import { DateRangePicker } from "@/components/layout/date-range-picker";
import {
  AccountCardsSkeleton,
  BlockSkeleton,
  ChartPairSkeleton,
  ChartSkeleton,
  SummaryCardsSkeleton,
} from "@/components/dashboard/skeletons";
import { resolveDateRange } from "./data";
import {
  AccountsSection,
  ChartsSection,
  GoalsSection,
  NetWorthSection,
  RecentTransactionsSection,
  SummarySection,
} from "./sections";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = resolveDateRange(await searchParams);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Your financial overview at a glance
          </p>
        </div>
        <Suspense fallback={null}>
          <DateRangePicker />
        </Suspense>
      </div>

      <Suspense fallback={<SummaryCardsSkeleton />}>
        <SummarySection from={from} to={to} />
      </Suspense>

      <Suspense fallback={<AccountCardsSkeleton />}>
        <AccountsSection from={from} to={to} />
      </Suspense>

      <Suspense fallback={<ChartPairSkeleton />}>
        <ChartsSection from={from} to={to} />
      </Suspense>

      <Suspense fallback={<ChartSkeleton />}>
        <NetWorthSection />
      </Suspense>

      <Suspense fallback={null}>
        <GoalsSection />
      </Suspense>

      <Suspense fallback={<BlockSkeleton className="h-[400px]" />}>
        <RecentTransactionsSection from={from} to={to} />
      </Suspense>
    </div>
  );
}
