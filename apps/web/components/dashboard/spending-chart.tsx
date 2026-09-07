"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useFormatCurrency } from "@/components/providers/currency-provider";

interface SpendingData {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  total: number;
  previousTotal: number;
}

interface SpendingChartProps {
  data: SpendingData[];
  from: string;
  to: string;
}

function spendingDelta(total: number, previousTotal: number) {
  if (previousTotal <= 0) {
    return { label: "new", className: "text-muted-foreground" };
  }
  const pct = ((total - previousTotal) / previousTotal) * 100;
  const arrow = pct >= 0 ? "↑" : "↓";
  const magnitude = Math.min(Math.abs(pct), 999).toFixed(0);
  return {
    label: `${arrow} ${magnitude}%`,
    className: pct >= 0 ? "text-rose-500" : "text-emerald-500",
  };
}

export const SpendingChart = memo(function SpendingChart({
  data,
  from,
  to,
}: SpendingChartProps) {
  const formatCurrency = useFormatCurrency();
  const total = useMemo(
    () => data.reduce((sum, item) => sum + item.total, 0),
    [data]
  );

  const topCategories = useMemo(() => data.slice(0, 6), [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending by Category</CardTitle>
        <CardDescription>This month&apos;s expense breakdown</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
            No expenses this month
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-4 lg:flex-row">
              <div className="h-[200px] w-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      dataKey="total"
                      nameKey="categoryName"
                      stroke="none"
                    >
                      {data.map((entry, index) => (
                        <Cell key={index} fill={entry.categoryColor} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value, true)}
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        background: "var(--popover)",
                        color: "var(--popover-foreground)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full flex-1 space-y-1">
                {topCategories.map((item) => {
                  const delta = spendingDelta(item.total, item.previousTotal);
                  return (
                    <Link
                      key={item.categoryId}
                      href={`/transactions?categoryId=${item.categoryId}&from=${from}&to=${to}`}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <div
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: item.categoryColor }}
                        />
                        <span className="truncate">
                          {item.categoryIcon} {item.categoryName}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`text-xs ${delta.className}`}>
                          {delta.label}
                        </span>
                        <span className="font-medium">
                          {formatCurrency(item.total, true)}
                        </span>
                        <span className="text-muted-foreground">
                          {((item.total / total) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Change is vs the previous month. Click a category to see its
              transactions.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
