"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getRecurringTransactions,
  deleteRecurringTransaction,
  toggleRecurringTransaction,
  processRecurringTransactions,
} from "@/lib/actions/recurring";
import { getAccounts } from "@/lib/actions/accounts";
import { getCategories } from "@/lib/actions/categories";
import { RecurringForm } from "@/components/recurring/recurring-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Pencil,
  Play,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { FinancialAccount, Category } from "@/lib/types";
import { FREQUENCY_LABELS } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export default function RecurringPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rulesData, accts, cats] = await Promise.all([
        getRecurringTransactions(),
        getAccounts(),
        getCategories(),
      ]);
      setRules(rulesData);
      setAccounts(accts as FinancialAccount[]);
      setCategories(cats as Category[]);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async (id: string) => {
    try {
      await deleteRecurringTransaction(id);
      toast.success("Recurring transaction deleted");
      loadData();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await toggleRecurringTransaction(id, isActive);
      toast.success(isActive ? "Activated" : "Paused");
      loadData();
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleProcess = async () => {
    setIsProcessing(true);
    try {
      const result = await processRecurringTransactions();
      if (result.created > 0) {
        toast.success(`Created ${result.created} transaction(s)`);
      } else {
        toast.info("No transactions due");
      }
      loadData();
    } catch {
      toast.error("Failed to process recurring transactions");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEdit = (rule: any) => {
    setEditData({
      id: rule.id,
      accountId: rule.accountId,
      categoryId: rule.categoryId,
      amount: rule.amount,
      fee: rule.fee,
      type: rule.type,
      description: rule.description,
      frequency: rule.frequency,
      startDate: rule.startDate,
      endDate: rule.endDate,
    });
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recurring Transactions</h1>
          <p className="text-muted-foreground">
            Manage auto-repeating income and expenses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleProcess}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-1 h-4 w-4" />
            )}
            Process Due
          </Button>
          <Button
            onClick={() => {
              setEditData(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add Rule
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Loading...
        </div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <RefreshCw className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">No recurring transactions</p>
            <p className="text-sm">
              Create rules to auto-generate transactions on a schedule.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rules.map((rule) => (
            <Card
              key={rule.id}
              className={!rule.isActive ? "opacity-60" : undefined}
            >
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{rule.categoryIcon}</span>
                    <span className="font-semibold truncate">
                      {rule.description}
                    </span>
                    <Badge
                      variant="secondary"
                      className={
                        rule.type === "income"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                          : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400"
                      }
                    >
                      {rule.type}
                    </Badge>
                    <Badge variant="outline">
                      {FREQUENCY_LABELS[rule.frequency]}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>{rule.categoryName}</span>
                    <span>{rule.accountName}</span>
                    <span>
                      From {format(parseISO(rule.startDate), "MMM d, yyyy")}
                    </span>
                    {rule.endDate && (
                      <span>
                        Until {format(parseISO(rule.endDate), "MMM d, yyyy")}
                      </span>
                    )}
                    {rule.lastProcessed && (
                      <span>
                        Last:{" "}
                        {format(parseISO(rule.lastProcessed), "MMM d, yyyy")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className={`text-lg font-bold ${
                      rule.type === "income"
                        ? "text-emerald-500"
                        : "text-rose-500"
                    }`}
                  >
                    {rule.type === "income" ? "+" : "-"}
                    {formatCurrency(rule.amount)}
                  </span>
                  {rule.fee > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Fee: {formatCurrency(rule.fee)}
                    </p>
                  )}
                </div>

                <Switch
                  checked={rule.isActive}
                  onCheckedChange={(checked) =>
                    handleToggle(rule.id, checked)
                  }
                />

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                      />
                    }
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEdit(rule)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(rule.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RecurringForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditData(null);
            loadData();
          }
        }}
        accounts={accounts}
        categories={categories}
        editData={editData}
      />
    </div>
  );
}
