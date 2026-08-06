"use client";

import { memo } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { format, parse } from "date-fns";
import { useFormatCurrency } from "@/components/providers/currency-provider";

interface CategoryTrend {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  months: { month: string; total: number }[];
}

export const CategorySparklines = memo(function CategorySparklines({
  trends,
}: {
  trends: CategoryTrend[];
}) {
  const formatCurrency = useFormatCurrency();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Category Trends</CardTitle>
        <CardDescription>Six-month spend per category</CardDescription>
      </CardHeader>
      <CardContent>
        {trends.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
            No data yet
          </div>
        ) : (
          <div className="space-y-3">
            {trends.map((trend) => {
              const latest = trend.months[trend.months.length - 1]?.total ?? 0;
              const previous =
                trend.months[trend.months.length - 2]?.total ?? 0;
              const rising = latest > previous;
              const firstMonth = trend.months[0]?.month;
              const lastMonth = trend.months[trend.months.length - 1]?.month;
              return (
                <div key={trend.categoryId} className="flex items-center gap-3">
                  <span className="w-40 truncate text-sm">
                    {trend.categoryIcon} {trend.categoryName}
                  </span>
                  <div
                    className="h-8 flex-1"
                    title={
                      firstMonth && lastMonth
                        ? `${format(parse(firstMonth, "yyyy-MM", new Date()), "MMM")} – ${format(parse(lastMonth, "yyyy-MM", new Date()), "MMM")}`
                        : undefined
                    }
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend.months}>
                        <Line
                          type="monotone"
                          dataKey="total"
                          stroke={trend.categoryColor}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <span className="w-28 text-right text-sm font-medium">
                    {formatCurrency(latest, true)}
                    <span
                      className={`ml-1 text-xs ${
                        rising ? "text-rose-600" : "text-emerald-600"
                      }`}
                    >
                      {rising ? "▲" : "▼"}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
