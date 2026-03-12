"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { getDashboardData } from "@/lib/actions/dashboard";
import { SpendingChart } from "@/components/dashboard/spending-chart";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { DateRangePicker } from "@/components/layout/date-range-picker";
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

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>}>
      <AnalyticsContent />
    </Suspense>
  );
}

function AnalyticsContent() {
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const dateFrom =
    fromParam || format(startOfMonth(new Date()), "yyyy-MM-dd");
  const dateTo = toParam || format(endOfMonth(new Date()), "yyyy-MM-dd");

  const [data, setData] = useState<any>(null);

  const loadData = useCallback(async () => {
    const result = await getDashboardData({ from: dateFrom, to: dateTo });
    setData(result);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading...
      </div>
    );
  }

  const savingsRate =
    data.monthlyIncome > 0
      ? ((data.monthlyIncome - data.monthlyExpense) / data.monthlyIncome) * 100
      : 0;

  const daysInRange =
    differenceInDays(new Date(dateTo), new Date(dateFrom)) + 1;
  const dailyAvg = daysInRange > 0 ? data.monthlyExpense / daysInRange : 0;

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
              {formatCurrency(data.monthlyFees)}
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
              {formatCurrency(dailyAvg)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SpendingChart data={data.spendingByCategory} />
        <TrendChart data={data.monthlyTrend} />
      </div>

      {/* Top Spending Categories */}
      {data.spendingByCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Spending Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.spendingByCategory.map(
                (cat: any, index: number) => {
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
                          {formatCurrency(cat.total)} ({percentage.toFixed(1)}%)
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
                }
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
