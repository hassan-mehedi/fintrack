"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getBudgets,
  createBudget,
  deleteBudget,
  copyBudgetsFromPreviousMonth,
} from "@/lib/actions/budgets";
import { getCategories } from "@/lib/actions/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { budgetSchema, type BudgetInput } from "@fintrack/shared/validators";
import type { Category } from "@fintrack/shared/types";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Pencil,
  Copy,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { format, getDaysInMonth, subMonths } from "date-fns";
import { useFormatCurrency } from "@/components/providers/currency-provider";

type Budget = Awaited<ReturnType<typeof getBudgets>>[number];

type Pace = {
  label: string;
  className: string;
  barClassName: string;
};

function getMonthProgress(month: number, year: number) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return 1;
  }
  if (year === currentYear && month === currentMonth) {
    return now.getDate() / getDaysInMonth(now);
  }
  return 0;
}

function getPace(budget: Budget, monthProgress: number): Pace {
  const usedRatio = budget.budgetAmount > 0 ? budget.spent / budget.budgetAmount : 0;

  if (budget.spent > budget.budgetAmount) {
    return {
      label: "Over budget",
      className: "border-rose-500/30 bg-rose-500/10 text-rose-500",
      barClassName: "bg-rose-500",
    };
  }
  if (usedRatio > monthProgress + 0.05) {
    return {
      label: "Ahead of pace",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-500",
      barClassName: "bg-amber-500",
    };
  }
  return {
    label: "On track",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
    barClassName: "bg-emerald-500",
  };
}

export function BudgetsClient({
  initialBudgets,
  initialCategories,
  initialMonth,
  initialYear,
}: {
  initialBudgets: Budget[];
  initialCategories: Category[];
  initialMonth: number;
  initialYear: number;
}) {
  const router = useRouter();
  const formatCurrency = useFormatCurrency();

  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);
  const [budgets, setBudgets] = useState<Budget[]>(initialBudgets);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [formOpen, setFormOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  useEffect(() => {
    setMonth(initialMonth);
    setYear(initialYear);
  }, [initialMonth, initialYear]);

  const loadData = useCallback(async () => {
    try {
      const [budgetData, catData] = await Promise.all([
        getBudgets(month, year),
        getCategories("expense"),
      ]);
      setBudgets(budgetData);
      setCategories(catData as Category[]);
    } catch {
      toast.error("Failed to load budgets");
    }
  }, [month, year]);

  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    loadData();
  }, [loadData]);

  const form = useForm<BudgetInput>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      categoryId: "",
      amount: "",
      month,
      year,
    },
  });

  useEffect(() => {
    if (!formOpen) return;
    form.reset({
      categoryId: editingBudget?.categoryId ?? "",
      amount: editingBudget ? String(editingBudget.budgetAmount) : "",
      month,
      year,
    });
  }, [editingBudget, formOpen, month, year, form]);

  const openCreate = () => {
    setEditingBudget(null);
    setFormOpen(true);
  };

  const openEdit = (budget: Budget) => {
    setEditingBudget(budget);
    setFormOpen(true);
  };

  const onSubmit = async (data: BudgetInput) => {
    setIsLoading(true);
    try {
      await createBudget({ ...data, month, year });
      toast.success("Budget saved");
      setFormOpen(false);
      setEditingBudget(null);
      loadData();
    } catch {
      toast.error("Failed to save budget");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBudget(id);
      toast.success("Budget deleted");
      loadData();
    } catch {
      toast.error("Failed to delete budget");
    }
  };

  const handleCopyPrevious = async () => {
    setIsCopying(true);
    try {
      const { copied } = await copyBudgetsFromPreviousMonth(month, year);
      if (copied === 0) {
        toast.info(`Nothing to copy from ${previousMonthLabel}`);
      } else {
        toast.success(
          `Copied ${copied} budget${copied === 1 ? "" : "s"} from ${previousMonthLabel}`
        );
        loadData();
      }
    } catch {
      toast.error("Failed to copy budgets");
    } finally {
      setIsCopying(false);
    }
  };

  const goToMonth = (nextMonth: number, nextYear: number) => {
    setMonth(nextMonth);
    setYear(nextYear);
    const from = format(new Date(nextYear, nextMonth - 1, 1), "yyyy-MM-dd");
    router.replace(`/budgets?from=${from}`, { scroll: false });
  };

  const goToPrevMonth = () =>
    month === 1 ? goToMonth(12, year - 1) : goToMonth(month - 1, year);

  const goToNextMonth = () =>
    month === 12 ? goToMonth(1, year + 1) : goToMonth(month + 1, year);

  const monthDate = new Date(year, month - 1);
  const monthLabel = format(monthDate, "MMMM yyyy");
  const previousMonthLabel = format(subMonths(monthDate, 1), "MMMM yyyy");
  const monthProgress = getMonthProgress(month, year);

  const categoryItems = useMemo(() => {
    if (editingBudget) {
      return [
        {
          value: editingBudget.categoryId,
          label: (
            <>
              {editingBudget.categoryIcon} {editingBudget.categoryName}
            </>
          ),
        },
      ];
    }
    const budgetedCategoryIds = new Set(budgets.map((b) => b.categoryId));
    return categories
      .filter((c) => !budgetedCategoryIds.has(c.id))
      .map((cat) => ({
        value: cat.id,
        label: (
          <>
            {cat.icon} {cat.name}
          </>
        ),
      }));
  }, [editingBudget, budgets, categories]);

  const totalBudgeted = budgets.reduce((sum, b) => sum + b.budgetAmount, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
  const remaining = totalBudgeted - totalSpent;

  const copyButton = (
    <Button
      variant="outline"
      onClick={handleCopyPrevious}
      disabled={isCopying}
    >
      {isCopying ? (
        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
      ) : (
        <Copy className="mr-1 h-4 w-4" />
      )}
      Copy from last month
    </Button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Budgets</h1>
          <p className="text-muted-foreground">
            Set spending limits per category
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {copyButton}
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> Set Budget
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <Button variant="outline" size="icon" onClick={goToPrevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-lg font-semibold min-w-[180px] text-center">
          {monthLabel}
        </span>
        <Button variant="outline" size="icon" onClick={goToNextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {budgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p>No budgets set for {monthLabel}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={openCreate}>
              Set Your First Budget
            </Button>
            {copyButton}
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Budgeted
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrency(totalBudgeted)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Spent
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrency(totalSpent)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Remaining
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p
                  className={`text-2xl font-bold ${
                    remaining < 0 ? "text-rose-500" : "text-emerald-600"
                  }`}
                >
                  {remaining < 0
                    ? `-${formatCurrency(Math.abs(remaining))}`
                    : formatCurrency(remaining)}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {budgets.map((budget) => {
              const usedPercent =
                budget.budgetAmount > 0
                  ? (budget.spent / budget.budgetAmount) * 100
                  : 0;
              const barPercent = Math.min(usedPercent, 100);
              const pace = getPace(budget, monthProgress);

              return (
                <Card key={budget.id}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{budget.categoryIcon}</span>
                      <CardTitle className="text-base">
                        {budget.categoryName}
                      </CardTitle>
                    </div>
                    <div className="flex items-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        onClick={() => openEdit(budget)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(budget.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {formatCurrency(budget.spent)} spent
                      </span>
                      <span className="font-medium">
                        {formatCurrency(budget.budgetAmount)}
                      </span>
                    </div>
                    <div className="relative">
                      <Progress value={barPercent} className="h-2" />
                      <div
                        className={`absolute left-0 top-0 h-full rounded-full transition-all ${pace.barClassName}`}
                        style={{ width: `${barPercent}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {usedPercent.toFixed(0)}% used · {(monthProgress * 100).toFixed(0)}%
                        of month gone
                      </p>
                      <Badge variant="outline" className={pace.className}>
                        {pace.label}
                      </Badge>
                    </div>
                    {budget.spent > budget.budgetAmount && (
                      <p className="text-xs text-rose-500">
                        Over by {formatCurrency(budget.spent - budget.budgetAmount)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingBudget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingBudget ? "Edit Budget" : "Set Budget"} for {monthLabel}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={editingBudget !== null}
                      items={categoryItems}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categoryItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Budget Amount</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="e.g., 5000"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Budget
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
