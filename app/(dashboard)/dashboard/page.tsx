import { Suspense } from "react";
import dynamic from "next/dynamic";
import { getDashboardData } from "@/lib/actions/dashboard";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { AccountCards } from "@/components/dashboard/account-cards";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { DateRangePicker } from "@/components/layout/date-range-picker";
import type { FinancialAccount } from "@/lib/types";

const SpendingChart = dynamic(
  () =>
    import("@/components/dashboard/spending-chart").then(
      (mod) => mod.SpendingChart
    ),
  {
    loading: () => (
      <div className="h-[300px] rounded-lg border bg-card animate-pulse" />
    ),
  }
);

const TrendChart = dynamic(
  () =>
    import("@/components/dashboard/trend-chart").then(
      (mod) => mod.TrendChart
    ),
  {
    loading: () => (
      <div className="h-[300px] rounded-lg border bg-card animate-pulse" />
    ),
  }
);

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const data = await getDashboardData({
    from: params.from,
    to: params.to,
  });

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

      <SummaryCards
        totalAssets={data.totalAssets}
        totalLiabilities={data.totalLiabilities}
        netWorth={data.netWorth}
        monthlyIncome={data.monthlyIncome}
        monthlyExpense={data.monthlyExpense}
      />

      <AccountCards accounts={data.accounts as FinancialAccount[]} />

      <div className="grid gap-6 lg:grid-cols-2">
        <SpendingChart data={data.spendingByCategory} />
        <TrendChart data={data.monthlyTrend} />
      </div>

      <RecentTransactions transactions={data.recentTransactions} />
    </div>
  );
}
