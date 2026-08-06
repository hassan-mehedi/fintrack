"use client";

import { memo, useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
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
import { getDaysInMonth, isSameMonth } from "date-fns";
import { useFormatCurrency } from "@/components/providers/currency-provider";

interface DailyTotal {
  date: string;
  total: number;
}

interface CumulativeChartProps {
  dailySpend: DailyTotal[];
  prevDailySpend: DailyTotal[];
  budgetTotal: number;
  rangeStart: string;
}

function cumulativeByDay(rows: DailyTotal[], days: number, cutoffDay?: number) {
  const perDay = new Array<number>(days).fill(0);
  for (const row of rows) {
    const day = Number(row.date.slice(8, 10));
    if (day >= 1 && day <= days) perDay[day - 1] += row.total;
  }
  let running = 0;
  return perDay.map((value, i) => {
    running += value;
    return cutoffDay !== undefined && i + 1 > cutoffDay ? null : running;
  });
}

export const CumulativeChart = memo(function CumulativeChart({
  dailySpend,
  prevDailySpend,
  budgetTotal,
  rangeStart,
}: CumulativeChartProps) {
  const formatCurrency = useFormatCurrency();

  const chartData = useMemo(() => {
    const start = new Date(rangeStart);
    const days = getDaysInMonth(start);
    const now = new Date();
    const cutoff = isSameMonth(start, now) ? now.getDate() : undefined;
    const current = cumulativeByDay(dailySpend, days, cutoff);
    const previous = cumulativeByDay(
      prevDailySpend,
      getDaysInMonth(new Date(start.getFullYear(), start.getMonth() - 1, 1))
    );
    return Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      current: current[i],
      previous: previous[i] ?? null,
    }));
  }, [dailySpend, prevDailySpend, rangeStart]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cumulative Spend</CardTitle>
        <CardDescription>
          Running total by day, this month vs last
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="day"
                className="text-xs"
                tick={{ fill: "var(--muted-foreground)" }}
                interval={4}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "var(--muted-foreground)" }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value: number) => formatCurrency(value, true)}
                labelFormatter={(day) => `Day ${day}`}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {budgetTotal > 0 && (
                <ReferenceLine
                  y={budgetTotal}
                  stroke="#f59e0b"
                  strokeDasharray="6 4"
                  label={{
                    value: "Budget",
                    fill: "#f59e0b",
                    fontSize: 11,
                    position: "insideTopRight",
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="previous"
                name="Last month"
                stroke="var(--muted-foreground)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="current"
                name="This month"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
