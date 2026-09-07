"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GoalProgressBar } from "@/components/goals/goal-progress-bar";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import type { SavingsGoalWithProgress } from "@fintrack/shared/types";
import {
  CheckCircle2,
  Link2,
  MoreHorizontal,
  Pencil,
  PlusCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";

export type GoalView = SavingsGoalWithProgress & { monthlyNeeded: number | null };

function deadlineLabel(deadline: string) {
  const date = parseISO(deadline);
  const daysLeft = differenceInCalendarDays(date, new Date());
  const dateLabel = format(date, "d MMM yyyy");

  if (daysLeft < 0) return `${dateLabel} · ${Math.abs(daysLeft)}d overdue`;
  if (daysLeft === 0) return `${dateLabel} · due today`;
  return `${dateLabel} · ${daysLeft}d left`;
}

export function GoalCard({
  goal,
  onEdit,
  onContribute,
  onToggleComplete,
  onDelete,
}: {
  goal: GoalView;
  onEdit: (goal: GoalView) => void;
  onContribute: (goal: GoalView) => void;
  onToggleComplete: (goal: GoalView) => void;
  onDelete: (goal: GoalView) => void;
}) {
  const formatCurrency = useFormatCurrency();
  const isCompleted = goal.completedAt !== null;
  const target = Number(goal.targetAmount);

  return (
    <Card className={isCompleted ? "border-emerald-500/30" : ""}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-2xl">{goal.icon}</span>
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{goal.name}</CardTitle>
            {goal.accountName && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Link2 className="h-3 w-3" />
                <span className="truncate">{goal.accountName}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isCompleted && (
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
            >
              Completed
            </Badge>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="h-8 w-8" />}
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(goal)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              {!goal.accountId && (
                <DropdownMenuItem onClick={() => onContribute(goal)}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add money
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onToggleComplete(goal)}>
                {isCompleted ? (
                  <RotateCcw className="mr-2 h-4 w-4" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                {isCompleted ? "Reopen" : "Mark complete"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(goal)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xl font-bold" style={{ color: goal.color }}>
            {formatCurrency(goal.current)}
          </p>
          <p className="text-sm text-muted-foreground">
            of {formatCurrency(target)}
          </p>
        </div>
        <GoalProgressBar percent={goal.percent} color={goal.color} />
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{goal.percent.toFixed(0)}% saved</span>
          {goal.deadline && <span>{deadlineLabel(goal.deadline)}</span>}
        </div>
        {!isCompleted && goal.remaining > 0 && (
          <p className="text-xs text-muted-foreground">
            {formatCurrency(goal.remaining)} to go
            {goal.monthlyNeeded !== null && (
              <> · needs {formatCurrency(goal.monthlyNeeded)} per month</>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
