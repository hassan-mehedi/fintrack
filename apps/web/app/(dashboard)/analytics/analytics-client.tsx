"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { getDashboardData } from "@/lib/actions/dashboard";
import type {
  getMonthAnalytics,
  getSubscriptionCandidates,
  getYearOverview,
} from "@/lib/actions/analytics";
import { DateRangePicker } from "@/components/layout/date-range-picker";
import {
  AnomaliesCard,
  MonthReviewCard,
  SubscriptionsCard,
  TopMerchantsCard,
  WeekdaySplitCard,
} from "@/components/analytics/insight-cards";
import { SpendingHeatmap } from "@/components/analytics/spending-heatmap";
import { CategorySparklines } from "@/components/analytics/category-sparklines";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  format,
  startOfMonth,
  endOfMonth,
  differenceInDays,
} from "date-fns";
import { useFormatCurrency } from "@/components/providers/currency-provider";

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
type MonthAnalytics = Awaited<ReturnType<typeof getMonthAnalytics>>;
type YearOverview = Awaited<ReturnType<typeof getYearOverview>>;
type Subscriptions = Awaited<ReturnType<typeof getSubscriptionCandidates>>;

const SpendingChart = dynamic(
  () =>
    import("@/components/dashboard/spending-chart").then(
      (mod) => mod.SpendingChart
    ),
  {
    loading: () => (
      <div className="h-[300px] rounded-lg border bg-card animate-pulse" />
    ),
    ssr: false,
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
    ssr: false,
  }
);

const CumulativeChart = dynamic(
  () =>
    import("@/components/analytics/cumulative-chart").then(
      (mod) => mod.CumulativeChart
    ),
  {
    loading: () => (
      <div className="h-[300px] rounded-lg border bg-card animate-pulse" />
    ),
    ssr: false,
  }
);

const BudgetHistoryChart = dynamic(
  () =>
    import("@/components/analytics/budget-history-chart").then(
      (mod) => mod.BudgetHistoryChart
    ),
  {
    loading: () => (
      <div className="h-[300px] rounded-lg border bg-card animate-pulse" />
    ),
    ssr: false,
  }
);

const SavingsChart = dynamic(
  () =>
    import("@/components/analytics/savings-chart").then(
      (mod) => mod.SavingsChart
    ),
  {
    loading: () => (
      <div className="h-[300px] rounded-lg border bg-card animate-pulse" />
    ),
    ssr: false,
  }
);

const YearOverviewChart = dynamic(
  () =>
    import("@/components/analytics/year-overview-chart").then(
      (mod) => mod.YearOverviewChart
    ),
  {
    loading: () => (
      <div className="h-[300px] rounded-lg border bg-card animate-pulse" />
    ),
    ssr: false,
  }
);

export function AnalyticsClient({
  data,
  analytics,
  year,
  subscriptions,
}: {
  data: DashboardData;
  analytics: MonthAnalytics;
  year: YearOverview;
  subscriptions: Subscriptions;
}) {
  const formatCurrency = useFormatCurrency();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const dateFrom =
    fromParam || format(startOfMonth(new Date()), "yyyy-MM-dd");
  const dateTo = toParam || format(endOfMonth(new Date()), "yyyy-MM-dd");

  const savingsRate = useMemo(
    () =>
      data.monthlyIncome > 0
        ? ((data.monthlyIncome - data.monthlyExpense) / data.monthlyIncome) * 100
        : 0,
    [data]
  );

  const dailyAvg = useMemo(() => {
    const daysInRange =
      differenceInDays(new Date(dateTo), new Date(dateFrom)) + 1;
    return daysInRange > 0 ? data.monthlyExpense / daysInRange : 0;
  }, [data, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Detailed financial insights</p>
        </div>
        <DateRangePicker />
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Savings Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${
                savingsRate >= 0 ? "text-emerald-500" : "text-rose-500"
              }`}
            >
              {savingsRate.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Total Fees Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-500">
              {formatCurrency(data.monthlyFees, true)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Daily Average Expense
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-rose-500">
              {formatCurrency(dailyAvg, true)}
            </p>
          </CardContent>
        </Card>
      </div>

      <MonthReviewCard review={analytics.monthReview} />

      <AnomaliesCard anomalies={analytics.anomalies} />

      <div className="grid gap-6 lg:grid-cols-2">
        <CumulativeChart
          dailySpend={analytics.dailySpend}
          prevDailySpend={analytics.prevDailySpend}
          budgetTotal={analytics.budgetTotal}
          rangeStart={dateFrom}
        />
        <SpendingHeatmap
          dailySpend={analytics.dailySpend}
          rangeStart={dateFrom}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SpendingChart data={data.spendingByCategory} />
        <TrendChart data={data.monthlyTrend} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CategorySparklines trends={analytics.categoryTrends} />
        <BudgetHistoryChart history={analytics.budgetHistory} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SavingsChart savings={analytics.savings} />
        <div className="space-y-6">
          <WeekdaySplitCard split={analytics.weekdaySplit} />
          <TopMerchantsCard merchants={analytics.topMerchants} />
        </div>
      </div>

      <SubscriptionsCard subscriptions={subscriptions} />

      <YearOverviewChart overview={year} />

      {/* Top Spending Categories */}
      {data.spendingByCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Spending Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.spendingByCategory.map((cat, index) => {
                const percentage =
                  data.monthlyExpense > 0
                    ? (cat.total / data.monthlyExpense) * 100
                    : 0;
                return (
                  <div key={cat.categoryName} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>
                        {index + 1}. {cat.categoryIcon} {cat.categoryName}
                      </span>
                      <span className="font-medium">
                        {formatCurrency(cat.total, true)} ({percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: cat.categoryColor,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
