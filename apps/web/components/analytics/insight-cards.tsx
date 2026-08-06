"use client";

import { memo, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useFormatCurrency } from "@/components/providers/currency-provider";

interface MonthReview {
  income: number;
  expense: number;
  fees: number;
  previousIncome: number;
  previousExpense: number;
  biggestTransaction: {
    description: string;
    amount: number;
    date: string;
    categoryName: string;
    categoryIcon: string;
  } | null;
  topIncreases: {
    categoryName: string;
    categoryIcon: string;
    delta: number;
    total: number;
  }[];
}

export interface Anomaly {
  id: string;
  description: string;
  date: string;
  categoryName: string;
  categoryIcon: string;
  amount: number;
  categoryAverage: number;
}

function pctChange(current: number, previous: number) {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export const MonthReviewCard = memo(function MonthReviewCard({
  review,
}: {
  review: MonthReview;
}) {
  const formatCurrency = useFormatCurrency();
  const expenseChange = useMemo(
    () => pctChange(review.expense, review.previousExpense),
    [review]
  );
  const incomeChange = useMemo(
    () => pctChange(review.income, review.previousIncome),
    [review]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Month in Review</CardTitle>
        <CardDescription>How this month compares to last</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Spending vs last month</p>
          <p className="text-lg font-semibold">
            {formatCurrency(review.expense, true)}{" "}
            {expenseChange !== null && (
              <span
                className={`text-sm ${
                  expenseChange > 0 ? "text-rose-600" : "text-emerald-600"
                }`}
              >
                {expenseChange > 0 ? "▲" : "▼"}
                {Math.abs(expenseChange).toFixed(0)}%
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">Income vs last month</p>
          <p className="text-lg font-semibold">
            {formatCurrency(review.income, true)}{" "}
            {incomeChange !== null && (
              <span
                className={`text-sm ${
                  incomeChange >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {incomeChange >= 0 ? "▲" : "▼"}
                {Math.abs(incomeChange).toFixed(0)}%
              </span>
            )}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Biggest expense</p>
          {review.biggestTransaction ? (
            <>
              <p className="text-lg font-semibold">
                {formatCurrency(review.biggestTransaction.amount, true)}
              </p>
              <p className="text-sm text-muted-foreground">
                {review.biggestTransaction.categoryIcon}{" "}
                {review.biggestTransaction.description ||
                  review.biggestTransaction.categoryName}{" "}
                · {format(parseISO(review.biggestTransaction.date), "MMM d")}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No expenses yet</p>
          )}
          <p className="text-xs text-muted-foreground">Fees paid</p>
          <p className="text-sm font-medium">
            {formatCurrency(review.fees, true)}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Top increases</p>
          {review.topIncreases.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing grew vs last month
            </p>
          ) : (
            review.topIncreases.map((inc) => (
              <p key={inc.categoryName} className="text-sm">
                {inc.categoryIcon} {inc.categoryName}{" "}
                <span className="font-medium text-rose-600">
                  +{formatCurrency(inc.delta, true)}
                </span>
              </p>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
});

export const WeekdaySplitCard = memo(function WeekdaySplitCard({
  split,
}: {
  split: { dow: number; total: number }[];
}) {
  const formatCurrency = useFormatCurrency();
  const { weekday, weekend, bars, max } = useMemo(() => {
    const totals = new Array<number>(7).fill(0);
    for (const row of split) totals[row.dow] = row.total;
    const weekendTotal = totals[0] + totals[6];
    const weekdayTotal = totals.reduce((sum, v) => sum + v, 0) - weekendTotal;
    return {
      weekday: weekdayTotal,
      weekend: weekendTotal,
      bars: [1, 2, 3, 4, 5, 6, 0].map((dow) => ({
        dow,
        label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow],
        total: totals[dow],
      })),
      max: Math.max(...totals, 1),
    };
  }, [split]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekday vs Weekend</CardTitle>
        <CardDescription>
          Weekdays {formatCurrency(weekday, true)} · weekends{" "}
          {formatCurrency(weekend, true)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-[140px] gap-2">
          {bars.map((bar) => (
            <div
              key={bar.dow}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${bar.label}: ${formatCurrency(bar.total, true)}`}
            >
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-md bg-emerald-500"
                  style={{ height: `${(bar.total / max) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {bar.label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

export const TopMerchantsCard = memo(function TopMerchantsCard({
  merchants,
}: {
  merchants: { description: string; count: number; total: number }[];
}) {
  const formatCurrency = useFormatCurrency();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Merchants</CardTitle>
        <CardDescription>Where the money actually went</CardDescription>
      </CardHeader>
      <CardContent>
        {merchants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add descriptions to transactions to see merchants here.
          </p>
        ) : (
          <div className="space-y-2">
            {merchants.map((merchant) => (
              <div
                key={merchant.description}
                className="flex items-center justify-between text-sm"
              >
                <span className="truncate">
                  {merchant.description}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ×{merchant.count}
                  </span>
                </span>
                <span className="font-medium">
                  {formatCurrency(merchant.total, true)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export const SubscriptionsCard = memo(function SubscriptionsCard({
  subscriptions,
}: {
  subscriptions: {
    description: string;
    count: number;
    averageAmount: number;
    lastDate: string;
    monthsSeen: number;
  }[];
}) {
  const formatCurrency = useFormatCurrency();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
          Possible Subscriptions
        </CardTitle>
        <CardDescription>
          Repeating same-amount expenses you haven&apos;t marked as recurring
        </CardDescription>
      </CardHeader>
      <CardContent>
        {subscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing detected — no repeating unmarked charges in the last six
            months.
          </p>
        ) : (
          <div className="space-y-2">
            {subscriptions.map((sub) => (
              <div
                key={sub.description}
                className="flex items-center justify-between text-sm"
              >
                <span className="truncate">
                  {sub.description}
                  <span className="ml-1 text-xs text-muted-foreground">
                    seen {sub.monthsSeen} months, last{" "}
                    {format(parseISO(sub.lastDate), "MMM d")}
                  </span>
                </span>
                <span className="font-medium">
                  ~{formatCurrency(sub.averageAmount, true)}/mo
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export const AnomaliesCard = memo(function AnomaliesCard({
  anomalies,
}: {
  anomalies: Anomaly[];
}) {
  const formatCurrency = useFormatCurrency();
  if (anomalies.length === 0) return null;
  return (
    <Card className="border-amber-500/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Unusual Spending
        </CardTitle>
        <CardDescription>
          Far above the category&apos;s six-month average
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {anomalies.map((anomaly) => (
          <div
            key={anomaly.id}
            className="flex items-center justify-between text-sm"
          >
            <span className="truncate">
              {anomaly.categoryIcon}{" "}
              {anomaly.description || anomaly.categoryName} ·{" "}
              {format(parseISO(anomaly.date), "MMM d")}
            </span>
            <span className="font-medium">
              {formatCurrency(anomaly.amount, true)}
              <span className="ml-1 text-xs text-muted-foreground">
                avg {formatCurrency(anomaly.categoryAverage, true)}
              </span>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
});
