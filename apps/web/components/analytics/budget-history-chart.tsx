"use client";

import { memo, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

interface BudgetHistoryChartProps {
  history: { month: string; budgeted: number; spent: number }[];
}

export const BudgetHistoryChart = memo(function BudgetHistoryChart({
  history,
}: BudgetHistoryChartProps) {
  const formatCurrency = useFormatCurrency();
  const chartData = useMemo(
    () =>
      history.map((row) => ({
        ...row,
        label: format(parse(row.month, "yyyy-MM", new Date()), "MMM"),
        over: row.budgeted > 0 && row.spent > row.budgeted,
      })),
    [history]
  );
  const hasBudgets = history.some((row) => row.budgeted > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget vs Actual</CardTitle>
        <CardDescription>
          {hasBudgets
            ? "Red spend bars finished over budget"
            : "No budgets set in the last six months"}
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                dataKey="budgeted"
                name="Budgeted"
                fill="var(--muted-foreground)"
                fillOpacity={0.35}
                radius={[4, 4, 0, 0]}
              />
              <Bar dataKey="spent" name="Spent" radius={[4, 4, 0, 0]}>
                {chartData.map((row) => (
                  <Cell
                    key={row.month}
                    fill={row.over ? "#e11d48" : "#10b981"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
