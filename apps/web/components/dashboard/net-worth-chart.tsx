"use client";

import { memo, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
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
import { format, parseISO } from "date-fns";
import { useFormatCurrency } from "@/components/providers/currency-provider";

interface NetWorthPoint {
  date: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
}

interface NetWorthChartProps {
  history: NetWorthPoint[];
}

export const NetWorthChart = memo(function NetWorthChart({
  history,
}: NetWorthChartProps) {
  const formatCurrency = useFormatCurrency();
  const chartData = useMemo(
    () =>
      history.map((point) => ({
        ...point,
        label: format(parseISO(point.date), "MMM d"),
      })),
    [history]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Net Worth History</CardTitle>
        <CardDescription>Daily snapshots over the last six months</CardDescription>
      </CardHeader>
      <CardContent>
        {history.length < 2 ? (
          <div className="flex h-[200px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
            A snapshot of your net worth is saved each day you open the
            dashboard. The chart appears once there are a few days of history.
          </div>
        ) : (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient
                    id="netWorthGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="var(--primary)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--primary)"
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
                  minTickGap={24}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  width={40}
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
                  dataKey="netWorth"
                  stroke="var(--primary)"
                  fill="url(#netWorthGradient)"
                  strokeWidth={2}
                  name="Net worth"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
