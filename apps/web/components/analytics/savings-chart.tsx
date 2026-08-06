"use client";

import { memo, useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

interface SavingsChartProps {
  savings: {
    current: number;
    hasSavingsAccounts: boolean;
    growth: { month: string; balance: number }[];
    monthlyAverage: number;
    projected: { month: string; balance: number }[];
  };
}

export const SavingsChart = memo(function SavingsChart({
  savings,
}: SavingsChartProps) {
  const formatCurrency = useFormatCurrency();

  const chartData = useMemo(() => {
    const history = savings.growth.map((row) => ({
      label: format(parse(row.month, "yyyy-MM", new Date()), "MMM yy"),
      balance: row.balance,
      projected: null as number | null,
    }));
    // Bridge the dashed projection to the last real point
    if (history.length > 0) {
      history[history.length - 1].projected =
        history[history.length - 1].balance;
    }
    const future = savings.projected.map((row) => ({
      label: format(parse(row.month, "yyyy-MM", new Date()), "MMM yy"),
      balance: null as number | null,
      projected: row.balance,
    }));
    return [...history, ...future];
  }, [savings]);

  if (!savings.hasSavingsAccounts && savings.current === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Savings Growth</CardTitle>
          <CardDescription>FDR / DPS balance over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[240px] items-center justify-center text-center text-sm text-muted-foreground">
            Create an FDR or DPS account and transfer money into it — its
            growth and a six-month projection will show up here.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Savings Growth</CardTitle>
        <CardDescription>
          FDR / DPS balance, projected at{" "}
          {formatCurrency(savings.monthlyAverage, true)}/month
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="label"
                className="text-xs"
                tick={{ fill: "var(--muted-foreground)" }}
                interval={2}
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
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="balance"
                name="Balance"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="projected"
                name="Projected"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="4 4"
                strokeOpacity={0.6}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
