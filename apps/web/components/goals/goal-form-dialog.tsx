"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  savingsGoalSchema,
  type SavingsGoalInput,
} from "@fintrack/shared/validators";
import type { FinancialAccount, SavingsGoal } from "@fintrack/shared/types";
import { Loader2 } from "lucide-react";

const GOAL_ICONS = ["🎯", "🏠", "🚗", "✈️", "💍", "🎓", "🏖️", "💻", "🛡️", "👶", "🏦", "💰"];

const MANUAL = "manual";

const EMPTY_GOAL: SavingsGoalInput = {
  name: "",
  icon: "🎯",
  color: "#10b981",
  targetAmount: "",
  accountId: null,
  savedAmount: "",
  deadline: "",
};

function goalToFormValues(goal: SavingsGoal): SavingsGoalInput {
  return {
    name: goal.name,
    icon: goal.icon,
    color: goal.color,
    targetAmount: goal.targetAmount,
    accountId: goal.accountId,
    savedAmount: goal.savedAmount,
    deadline: goal.deadline ?? "",
  };
}

export function GoalFormDialog({
  open,
  onOpenChange,
  goal,
  accounts,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: SavingsGoal | null;
  accounts: FinancialAccount[];
  onSubmit: (data: SavingsGoalInput) => Promise<void>;
}) {
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<SavingsGoalInput>({
    resolver: zodResolver(savingsGoalSchema),
    defaultValues: EMPTY_GOAL,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(goal ? goalToFormValues(goal) : EMPTY_GOAL);
  }, [goal, open, form]);

  const watchedAccountId = form.watch("accountId");

  const sourceItems = useMemo(
    () => [
      { value: MANUAL, label: "Track manually" },
      ...accounts.map((account) => ({
        value: account.id,
        label: (
          <>
            {account.icon} {account.name}
          </>
        ),
      })),
    ],
    [accounts]
  );

  const handleSubmit = async (data: SavingsGoalInput) => {
    setIsSaving(true);
    try {
      await onSubmit(data);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{goal ? "Edit Goal" : "New Goal"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Goal Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Emergency fund" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Icon</FormLabel>
                    <FormControl>
                      <Input placeholder="Any emoji" className="text-lg" {...field} />
                    </FormControl>
                    <div className="flex flex-wrap gap-1">
                      {GOAL_ICONS.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => field.onChange(icon)}
                          className={`flex h-8 w-8 items-center justify-center rounded-md border text-lg transition-colors hover:bg-muted ${
                            field.value === icon ? "border-primary bg-muted" : ""
                          }`}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <Input type="color" className="h-10 w-20" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="targetAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Amount</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="e.g., 100000"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="deadline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deadline</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormDescription>Optional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="accountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Progress Source</FormLabel>
                  <Select
                    value={field.value ?? MANUAL}
                    onValueChange={(value) =>
                      field.onChange(value === MANUAL ? null : value)
                    }
                    items={sourceItems}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {sourceItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {field.value
                      ? "Progress follows the balance of the linked account"
                      : "Add money to this goal yourself as you save"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!watchedAccountId && (
              <FormField
                control={form.control}
                name="savedAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Saved So Far</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <Button type="submit" className="w-full" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {goal ? "Save Changes" : "Create Goal"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
