"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  goalContributionSchema,
  type GoalContributionInput,
} from "@fintrack/shared/validators";
import type { SavingsGoalWithProgress } from "@fintrack/shared/types";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import { Loader2 } from "lucide-react";

export function ContributeDialog({
  goal,
  onOpenChange,
  onSubmit,
}: {
  goal: SavingsGoalWithProgress | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (goalId: string, data: GoalContributionInput) => Promise<void>;
}) {
  const formatCurrency = useFormatCurrency();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<GoalContributionInput>({
    resolver: zodResolver(goalContributionSchema),
    defaultValues: { amount: "" },
  });

  useEffect(() => {
    if (goal) form.reset({ amount: "" });
  }, [goal, form]);

  const handleSubmit = async (data: GoalContributionInput) => {
    if (!goal) return;
    setIsSaving(true);
    try {
      await onSubmit(goal.id, data);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={goal !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add money to {goal?.name}</DialogTitle>
          <DialogDescription>
            {goal ? `Saved so far: ${formatCurrency(goal.current)}` : null}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="e.g., 5000"
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Use a negative amount to correct a mistake
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
