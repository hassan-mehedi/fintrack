"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  contributeToGoal,
  createGoal,
  deleteGoal,
  setGoalCompleted,
  updateGoal,
} from "@/lib/actions/goals";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GoalCard, type GoalView } from "@/components/goals/goal-card";
import { GoalFormDialog } from "@/components/goals/goal-form-dialog";
import { ContributeDialog } from "@/components/goals/contribute-dialog";
import type {
  GoalContributionInput,
  SavingsGoalInput,
} from "@fintrack/shared/validators";
import type { FinancialAccount } from "@fintrack/shared/types";
import { toast } from "sonner";
import { Plus, Target } from "lucide-react";

export function GoalsClient({
  goals,
  accounts,
}: {
  goals: GoalView[];
  accounts: FinancialAccount[];
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalView | null>(null);
  const [contributeTarget, setContributeTarget] = useState<GoalView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GoalView | null>(null);

  const openCreate = () => {
    setEditingGoal(null);
    setFormOpen(true);
  };

  const openEdit = (goal: GoalView) => {
    setEditingGoal(goal);
    setFormOpen(true);
  };

  const handleSubmit = async (data: SavingsGoalInput) => {
    try {
      if (editingGoal) {
        await updateGoal(editingGoal.id, data);
        toast.success("Goal updated");
      } else {
        await createGoal(data);
        toast.success("Goal created");
      }
      setFormOpen(false);
      setEditingGoal(null);
      router.refresh();
    } catch {
      toast.error(editingGoal ? "Failed to update goal" : "Failed to create goal");
    }
  };

  const handleContribute = async (goalId: string, data: GoalContributionInput) => {
    try {
      await contributeToGoal(goalId, data);
      toast.success("Goal updated");
      setContributeTarget(null);
      router.refresh();
    } catch {
      toast.error("Failed to add money");
    }
  };

  const handleToggleComplete = async (goal: GoalView) => {
    const completed = goal.completedAt === null;
    try {
      await setGoalCompleted(goal.id, completed);
      toast.success(completed ? "Goal marked complete" : "Goal reopened");
      router.refresh();
    } catch {
      toast.error("Failed to update goal");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteGoal(deleteTarget.id);
      toast.success("Goal deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete goal");
    } finally {
      setDeleteTarget(null);
    }
  };

  const inProgressCount = goals.filter((g) => !g.completedAt).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Goals</h1>
          <p className="text-muted-foreground">
            {goals.length === 0
              ? "Save towards the things that matter"
              : `${inProgressCount} in progress · ${goals.length - inProgressCount} completed`}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> New goal
        </Button>
      </div>

      {goals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Target className="mb-3 h-8 w-8" />
          <p>No savings goals yet</p>
          <Button variant="outline" className="mt-4" onClick={openCreate}>
            Create your first goal
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={openEdit}
              onContribute={setContributeTarget}
              onToggleComplete={handleToggleComplete}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <GoalFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingGoal(null);
        }}
        goal={editingGoal}
        accounts={accounts}
        onSubmit={handleSubmit}
      />

      <ContributeDialog
        goal={contributeTarget}
        onOpenChange={(open) => {
          if (!open) setContributeTarget(null);
        }}
        onSubmit={handleContribute}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the goal and its saved progress. Linked accounts are
              not affected. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
