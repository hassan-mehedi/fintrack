"use client";

import { memo, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { format, parse } from "date-fns";
import { useFormatCurrency } from "@/components/providers/currency-provider";

interface YearOverviewProps {
  overview: {
    year: number;
    months: { month: string; income: number; expense: number; saved: number }[];
    totals: {
      income: number;
      expense: number;
      saved: number;
      averageMonthlyExpense: number;
    };
  };
}

export const YearOverviewChart = memo(function YearOverviewChart({
  overview,
}: YearOverviewProps) {
  const formatCurrency = useFormatCurrency();
  const chartData = useMemo(
    () =>
      overview.months.map((row) => ({
        ...row,
        label: format(parse(row.month, "yyyy-MM", new Date()), "MMM"),
      })),
    [overview]
  );

  const stats = [
    { title: "Income", value: overview.totals.income },
    { title: "Expenses", value: overview.totals.expense },
    { title: "Saved (FDR/DPS)", value: overview.totals.saved },
    { title: "Avg monthly burn", value: overview.totals.averageMonthlyExpense },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{overview.year} Overview</CardTitle>
        <CardDescription>The whole year at a glance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.title}>
              <p className="text-xs text-muted-foreground">{stat.title}</p>
              <p className="text-lg font-semibold">
                {formatCurrency(stat.value, true)}
              </p>
            </div>
          ))}
        </div>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="label"
                className="text-xs"
                tick={{ fill: "var(--muted-foreground)" }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "var(--muted-foreground)" }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value: number) => formatCurrency(value, true)}
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="income"
                name="Income"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="expense"
                name="Expense"
                fill="#e11d48"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="saved"
                name="Saved"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
