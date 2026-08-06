"use client";

import { memo, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDay, getDaysInMonth } from "date-fns";
import { useFormatCurrency } from "@/components/providers/currency-provider";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

interface SpendingHeatmapProps {
  dailySpend: { date: string; total: number }[];
  rangeStart: string;
}

export const SpendingHeatmap = memo(function SpendingHeatmap({
  dailySpend,
  rangeStart,
}: SpendingHeatmapProps) {
  const formatCurrency = useFormatCurrency();

  const { cells, max } = useMemo(() => {
    const start = new Date(rangeStart);
    const days = getDaysInMonth(start);
    const totals = new Map(
      dailySpend.map((row) => [Number(row.date.slice(8, 10)), row.total])
    );
    const highest = Math.max(0, ...totals.values());
    const leadingBlanks = getDay(start);
    const dayCells = Array.from({ length: days }, (_, i) => ({
      day: i + 1,
      total: totals.get(i + 1) ?? 0,
    }));
    return {
      cells: [
        ...Array.from({ length: leadingBlanks }, () => null),
        ...dayCells,
      ],
      max: highest,
    };
  }, [dailySpend, rangeStart]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending Heatmap</CardTitle>
        <CardDescription>Darker days cost you more</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {WEEKDAY_LABELS.map((label, i) => (
            <div key={`${label}-${i}`}>{label}</div>
          ))}
          {cells.map((cell, i) =>
            cell === null ? (
              <div key={`blank-${i}`} />
            ) : (
              <div
                key={cell.day}
                title={`Day ${cell.day}: ${formatCurrency(cell.total, true)}`}
                className="flex aspect-square items-center justify-center rounded-md border border-border/50"
                style={{
                  backgroundColor:
                    cell.total > 0 && max > 0
                      ? `rgba(16, 185, 129, ${0.15 + 0.75 * (cell.total / max)})`
                      : "transparent",
                }}
              >
                <span
                  className={
                    max > 0 && cell.total / max > 0.55
                      ? "text-white dark:text-emerald-950"
                      : "text-foreground/70"
                  }
                >
                  {cell.day}
                </span>
              </div>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
});
