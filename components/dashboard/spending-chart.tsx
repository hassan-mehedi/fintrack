"use client";

import { memo, useMemo } from "react";
import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface SpendingData {
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  total: number;
}

interface SpendingChartProps {
  data: SpendingData[];
}

export const SpendingChart = memo(function SpendingChart({
  data,
}: SpendingChartProps) {
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
            <div className="flex-1 space-y-2">
              {topCategories.map((item) => (
                <div
                  key={item.categoryName}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: item.categoryColor }}
                    />
                    <span>
                      {item.categoryIcon} {item.categoryName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {formatCurrency(item.total, true)}
                    </span>
                    <span className="text-muted-foreground">
                      {((item.total / total) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
