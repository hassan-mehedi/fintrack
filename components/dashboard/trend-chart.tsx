"use client";

import { memo, useMemo } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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

interface TrendData {
  month: string;
  income: number;
  expense: number;
}

interface TrendChartProps {
  data: TrendData[];
}

export const TrendChart = memo(function TrendChart({ data }: TrendChartProps) {
  const formatCurrency = useFormatCurrency();
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        label: format(parse(d.month, "yyyy-MM", new Date()), "MMM"),
      })),
    [data]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Trend</CardTitle>
        <CardDescription>Income vs expenses over time</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
            No data yet
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient
                    id="incomeGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="#10b981"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="#10b981"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient
                    id="expenseGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="#f43f5e"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="#f43f5e"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-muted"
                />
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
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="income"
                  stroke="#10b981"
                  fill="url(#incomeGradient)"
                  strokeWidth={2}
                  name="Income"
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  stroke="#f43f5e"
                  fill="url(#expenseGradient)"
                  strokeWidth={2}
                  name="Expense"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
