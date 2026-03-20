"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { getBudgets, createBudget, deleteBudget } from "@/lib/actions/budgets";
import { getCategories } from "@/lib/actions/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { budgetSchema, type BudgetInput } from "@/lib/validators";
import type { Category } from "@/lib/types";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { useFormatCurrency } from "@/components/providers/currency-provider";

export default function BudgetsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>}>
      <BudgetsContent />
    </Suspense>
  );
}

function BudgetsContent() {
  const formatCurrency = useFormatCurrency();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const now = new Date();
  const fromParam = searchParams.get("from");
  const initialMonth = fromParam
    ? new Date(fromParam).getMonth() + 1
    : now.getMonth() + 1;
  const initialYear = fromParam
    ? new Date(fromParam).getFullYear()
    : now.getFullYear();

  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

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
    } finally {
      setInitialLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
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

  const onSubmit = async (data: BudgetInput) => {
    setIsLoading(true);
    try {
      await createBudget({ ...data, month, year });
      toast.success("Budget saved");
      form.reset({ categoryId: "", amount: "", month, year });
      setFormOpen(false);
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

  const goToPrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const goToNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const monthLabel = format(new Date(year, month - 1), "MMMM yyyy");

  // Categories not yet budgeted
  const budgetedCategoryIds = new Set(budgets.map((b) => b.categoryId));
  const availableCategories = categories.filter(
    (c) => !budgetedCategoryIds.has(c.id)
  );

  if (initialLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-28 rounded bg-muted animate-pulse" />
            <div className="h-4 w-52 rounded bg-muted animate-pulse mt-2" />
          </div>
          <div className="h-9 w-28 rounded bg-muted animate-pulse" />
        </div>
        <div className="flex items-center justify-center gap-4">
          <div className="h-9 w-9 rounded bg-muted animate-pulse" />
          <div className="h-7 w-[180px] rounded bg-muted animate-pulse" />
          <div className="h-9 w-9 rounded bg-muted animate-pulse" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-[150px] rounded-lg border bg-card animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Budgets</h1>
          <p className="text-muted-foreground">
            Set spending limits per category
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Set Budget
        </Button>
      </div>

      {/* Month Navigation */}
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

      {/* Budget Cards */}
      {budgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p>No budgets set for {monthLabel}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setFormOpen(true)}
          >
            Set Your First Budget
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {budgets.map((budget) => {
            const percentage = Math.min(
              (budget.spent / budget.budgetAmount) * 100,
              100
            );
            const progressColor =
              percentage >= 90
                ? "bg-rose-500"
                : percentage >= 70
                ? "bg-amber-500"
                : "bg-emerald-500";

            return (
              <Card key={budget.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{budget.categoryIcon}</span>
                    <CardTitle className="text-base">
                      {budget.categoryName}
                    </CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(budget.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {formatCurrency(budget.spent)} spent
                    </span>
                    <span className="font-medium">
                      {formatCurrency(budget.budgetAmount)}
                    </span>
                  </div>
                  <div className="relative">
                    <Progress value={percentage} className="h-2" />
                    <div
                      className={`absolute left-0 top-0 h-full rounded-full transition-all ${progressColor}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <p
                    className={`text-xs ${
                      percentage >= 90
                        ? "text-rose-500"
                        : percentage >= 70
                        ? "text-amber-500"
                        : "text-emerald-500"
                    }`}
                  >
                    {percentage.toFixed(0)}% used
                    {budget.spent > budget.budgetAmount &&
                      ` (over by ${formatCurrency(budget.spent - budget.budgetAmount)})`}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Budget Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Budget for {monthLabel}</DialogTitle>
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
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id} label={`${cat.icon} ${cat.name}`}>
                            {cat.icon} {cat.name}
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
