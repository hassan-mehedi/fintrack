import { Suspense } from "react";
import { getDashboardData } from "@/lib/actions/dashboard";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { AccountCards } from "@/components/dashboard/account-cards";
import { SpendingChart } from "@/components/dashboard/spending-chart";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { DateRangePicker } from "@/components/layout/date-range-picker";
import type { FinancialAccount } from "@/lib/types";

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
        totalBalance={data.totalBalance}
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
