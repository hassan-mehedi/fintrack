"use client";

import Link from "next/link";
import { ArrowRight, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GoalProgressBar } from "@/components/goals/goal-progress-bar";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import type { SavingsGoalWithProgress } from "@fintrack/shared/types";

const MAX_ROWS = 3;

export function GoalsSummary({ goals }: { goals: SavingsGoalWithProgress[] }) {
  const formatCurrency = useFormatCurrency();
  const inProgress = goals.filter((g) => !g.completedAt).slice(0, MAX_ROWS);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Savings goals
        </CardTitle>
        <Link
          href="/goals"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {inProgress.length === 0 ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Target className="h-4 w-4 shrink-0" />
            <p>
              No goals in progress.{" "}
              <Link href="/goals" className="underline underline-offset-4 hover:text-foreground">
                Set one
              </Link>
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {inProgress.map((goal) => (
              <li key={goal.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span>{goal.icon}</span>
                    <span className="truncate font-medium">{goal.name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatCurrency(goal.current, true)} /{" "}
                    {formatCurrency(Number(goal.targetAmount), true)}
                  </span>
                </div>
                <GoalProgressBar percent={goal.percent} color={goal.color} className="h-1.5" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
