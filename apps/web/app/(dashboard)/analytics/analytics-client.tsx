"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { getDashboardData } from "@/lib/actions/dashboard";
import type { getMonthAnalytics, getYearOverview } from "@/lib/actions/analytics";
import {
  TopMerchantsCard,
  WeekdaySplitCard,
} from "@/components/analytics/insight-cards";
import { SpendingHeatmap } from "@/components/analytics/spending-heatmap";
import { CategorySparklines } from "@/components/analytics/category-sparklines";
import { ChartSkeleton } from "@/components/dashboard/skeletons";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { differenceInDays } from "date-fns";
import { useFormatCurrency } from "@/components/providers/currency-provider";

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
type MonthAnalytics = Awaited<ReturnType<typeof getMonthAnalytics>>;
type YearOverview = Awaited<ReturnType<typeof getYearOverview>>;

const SpendingChart = dynamic(
  () =>
    import("@/components/dashboard/spending-chart").then(
      (mod) => mod.SpendingChart
    ),
  { loading: () => <ChartSkeleton />, ssr: false }
);

const TrendChart = dynamic(
  () =>
    import("@/components/dashboard/trend-chart").then(
      (mod) => mod.TrendChart
    ),
  { loading: () => <ChartSkeleton />, ssr: false }
);

const CumulativeChart = dynamic(
  () =>
    import("@/components/analytics/cumulative-chart").then(
      (mod) => mod.CumulativeChart
    ),
  { loading: () => <ChartSkeleton />, ssr: false }
);

const BudgetHistoryChart = dynamic(
  () =>
    import("@/components/analytics/budget-history-chart").then(
      (mod) => mod.BudgetHistoryChart
    ),
  { loading: () => <ChartSkeleton />, ssr: false }
);

const SavingsChart = dynamic(
  () =>
    import("@/components/analytics/savings-chart").then(
      (mod) => mod.SavingsChart
    ),
  { loading: () => <ChartSkeleton />, ssr: false }
);

const YearOverviewChart = dynamic(
  () =>
    import("@/components/analytics/year-overview-chart").then(
      (mod) => mod.YearOverviewChart
    ),
  { loading: () => <ChartSkeleton />, ssr: false }
);

export function AnalyticsSummary({
  data,
  from,
  to,
}: {
  data: DashboardData;
  from: string;
  to: string;
}) {
  const formatCurrency = useFormatCurrency();

  const savingsRate = useMemo(
    () =>
      data.monthlyIncome > 0
        ? ((data.monthlyIncome - data.monthlyExpense) / data.monthlyIncome) * 100
        : 0,
    [data]
  );

  const dailyAvg = useMemo(() => {
    const daysInRange = differenceInDays(new Date(to), new Date(from)) + 1;
    return daysInRange > 0 ? data.monthlyExpense / daysInRange : 0;
  }, [data, from, to]);

  return (
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
  );
}

export function DailySpendCharts({
  analytics,
  rangeStart,
}: {
  analytics: MonthAnalytics;
  rangeStart: string;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <CumulativeChart
        dailySpend={analytics.dailySpend}
        prevDailySpend={analytics.prevDailySpend}
        budgetTotal={analytics.budgetTotal}
        rangeStart={rangeStart}
      />
      <SpendingHeatmap dailySpend={analytics.dailySpend} rangeStart={rangeStart} />
    </div>
  );
}

export function CategoryCharts({
  data,
  from,
  to,
}: {
  data: DashboardData;
  from: string;
  to: string;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SpendingChart data={data.spendingByCategory} from={from} to={to} />
      <TrendChart data={data.monthlyTrend} />
    </div>
  );
}

export function TrendCharts({ analytics }: { analytics: MonthAnalytics }) {
  return (
    <>
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
    </>
  );
}

export function YearOverviewSection({ overview }: { overview: YearOverview }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: current - 2020 + 1 }, (_, i) => current - i);
  }, []);

  const selectYear = (value: string | null) => {
    if (!value) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", value);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <YearOverviewChart
      overview={overview}
      action={
        <Select value={String(overview.year)} onValueChange={selectYear}>
          <SelectTrigger className="w-[100px]" aria-label="Year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}

export function TopSpendingCategories({ data }: { data: DashboardData }) {
  const formatCurrency = useFormatCurrency();

  if (data.spendingByCategory.length === 0) return null;

  return (
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
  );
}
