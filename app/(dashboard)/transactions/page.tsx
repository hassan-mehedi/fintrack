"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { getTransactions } from "@/lib/actions/transactions";
import { getAccounts } from "@/lib/actions/accounts";
import { getCategories } from "@/lib/actions/categories";
import {
  deleteTransaction,
  bulkSetTransactionStatus,
  bulkSetCategory,
  bulkDeleteTransactions,
} from "@/lib/actions/transactions";
import {
  undoDeleteTransaction,
  undoBulkDeleteTransactions,
} from "@/lib/actions/undo";
import { exportTransactionsCSV } from "@/lib/actions/export";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCheck } from "lucide-react";
import { SmartSearch, type SmartSearchResult } from "@/components/transactions/smart-search";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import type { FinancialAccount, Category } from "@/lib/types";
import { DateRangePicker } from "@/components/layout/date-range-picker";
import { useFormatCurrency } from "@/components/providers/currency-provider";

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>}>
      <TransactionsContent />
    </Suspense>
  );
}

function TransactionsContent() {
  const formatCurrency = useFormatCurrency();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [aiResult, setAiResult] = useState<SmartSearchResult | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const dateFrom = fromParam || format(startOfMonth(new Date()), "yyyy-MM-dd");
  const dateTo = toParam || format(endOfMonth(new Date()), "yyyy-MM-dd");

  // Debounce search input by 300ms
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Fetch reference data (accounts/categories) once on mount
  const refDataLoaded = useRef(false);
  useEffect(() => {
    if (!refDataLoaded.current) {
      refDataLoaded.current = true;
      Promise.all([getAccounts(), getCategories()]).then(([accts, cats]) => {
        setAccounts(accts as FinancialAccount[]);
        setCategories(cats as Category[]);
      });
    }
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const txnData = await getTransactions({
        page,
        search: debouncedSearch || undefined,
        type: typeFilter !== "all" ? typeFilter : undefined,
        categoryId: categoryFilter !== "all" ? categoryFilter : undefined,
        startDate: dateFrom,
        endDate: dateTo,
      });
      setTransactions(txnData.transactions);
      setTotal(txnData.total);
      setTotalPages(txnData.totalPages);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, typeFilter, categoryFilter, dateFrom, dateTo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async (id: string) => {
    try {
      await deleteTransaction(id);
      toast.success("Transaction deleted", {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await undoDeleteTransaction(id);
              toast.success("Restored");
              loadData();
            } catch {
              toast.error("Could not undo");
            }
          },
        },
        duration: 30_000,
      });
      loadData();
    } catch {
      toast.error("Failed to delete transaction");
    }
  };

  const handleEdit = (txn: any) => {
    setEditingTransaction({
      id: txn.id,
      type: txn.type,
      amount: txn.amount,
      fee: txn.fee,
      description: txn.description,
      date: txn.date,
      accountId: txn.accountId,
      categoryId: txn.categoryId,
      toAccountId: txn.toAccountId,
      merchantId: txn.merchantId ?? null,
      tags: txn.tags || [],
    });
    setFormOpen(true);
  };

  const handleExport = async () => {
    try {
      const csv = await exportTransactionsCSV({
        type: typeFilter !== "all" ? typeFilter : undefined,
        categoryId: categoryFilter !== "all" ? categoryFilter : undefined,
        startDate: dateFrom,
        endDate: dateTo,
        search: search || undefined,
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `fintrack-transactions-${dateFrom}-to-${dateTo}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Exported successfully");
    } catch {
      toast.error("Failed to export");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">{total} transactions found</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker />
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-1 h-4 w-4" /> Export
          </Button>
          <Button onClick={() => { setEditingTransaction(null); setFormOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      {/* Smart (AI) search */}
      <SmartSearch onResult={setAiResult} />

      {/* Filters — hidden while an AI filter is active to avoid confusion */}
      {!aiResult && (
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id} label={`${cat.icon} ${cat.name}`}>
                {cat.icon} {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="cleared">Cleared</SelectItem>
            <SelectItem value="reconciled">Reconciled</SelectItem>
          </SelectContent>
        </Select>
      </div>
      )}

      {/* Bulk actions bar — visible when ≥1 transaction is selected */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 p-2 text-sm">
          <span>{selected.size} selected</span>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy}
              onClick={async () => {
                setBulkBusy(true);
                try {
                  await bulkSetTransactionStatus(Array.from(selected), "reconciled");
                  toast.success(`${selected.size} marked reconciled`);
                  setSelected(new Set());
                  loadData();
                } catch {
                  toast.error("Could not update status");
                } finally {
                  setBulkBusy(false);
                }
              }}
            >
              <CheckCheck className="mr-1 h-4 w-4" /> Mark reconciled
            </Button>
            <Select
              onValueChange={async (categoryId) => {
                if (!categoryId) return;
                setBulkBusy(true);
                try {
                  await bulkSetCategory(Array.from(selected), categoryId);
                  toast.success(`Re-categorised ${selected.size} transaction(s)`);
                  setSelected(new Set());
                  loadData();
                } catch {
                  toast.error("Could not re-categorise");
                } finally {
                  setBulkBusy(false);
                }
              }}
            >
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue placeholder="Re-categorise…" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="destructive"
              disabled={bulkBusy}
              onClick={async () => {
                if (
                  !confirm(`Delete ${selected.size} transaction(s)? Balances will be reversed.`)
                )
                  return;
                setBulkBusy(true);
                try {
                  const ids = Array.from(selected);
                  const { deleted } = await bulkDeleteTransactions(ids);
                  toast.success(`Deleted ${deleted} transaction(s)`, {
                    description:
                      deleted < ids.length
                        ? `${ids.length - deleted} could not be deleted.`
                        : undefined,
                    action: {
                      label: "Undo",
                      onClick: async () => {
                        try {
                          const { restored } = await undoBulkDeleteTransactions(ids);
                          toast.success(`Restored ${restored} transaction(s)`);
                          loadData();
                        } catch {
                          toast.error("Could not undo");
                        }
                      },
                    },
                    duration: 30_000,
                  });
                  setSelected(new Set());
                  loadData();
                } catch {
                  toast.error("Could not delete");
                } finally {
                  setBulkBusy(false);
                }
              }}
            >
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={
                    transactions.length > 0 &&
                    transactions.every((t: any) => selected.has(t.id))
                  }
                  onCheckedChange={(v) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (v) {
                        for (const t of transactions) next.add((t as any).id);
                      } else {
                        for (const t of transactions) next.delete((t as any).id);
                      }
                      return next;
                    });
                  }}
                />
              </TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10">
                  Loading...
                </TableCell>
              </TableRow>
            ) : (aiResult ? aiResult.transactions : transactions).length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-10 text-muted-foreground"
                >
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              (aiResult ? aiResult.transactions : transactions)
                .filter((txn: any) =>
                  aiResult || statusFilter === "all"
                    ? true
                    : txn.status === statusFilter,
                )
                .map((txn: any) => (
                <TableRow key={txn.id} data-state={selected.has(txn.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(txn.id)}
                      onCheckedChange={(v) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (v) next.add(txn.id);
                          else next.delete(txn.id);
                          return next;
                        });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{txn.categoryIcon}</span>
                      <div>
                        <span className="font-medium">
                          {txn.description || txn.categoryName}
                        </span>
                        {txn.isReimbursable && (
                          <Badge
                            variant="outline"
                            className="ml-2 text-[10px] px-1 py-0"
                          >
                            {txn.reimbursedAt ? "Reimbursed" : "Reimbursable"}
                          </Badge>
                        )}
                        {txn.tags && txn.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {txn.tags.map((tag: string) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="text-[10px] px-1 py-0"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      style={{
                        borderColor: txn.categoryColor,
                        color: txn.categoryColor,
                      }}
                    >
                      {txn.categoryName}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {txn.accountName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(parseISO(txn.date), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        txn.status === "reconciled"
                          ? "default"
                          : txn.status === "pending"
                            ? "outline"
                            : "secondary"
                      }
                      className="capitalize"
                    >
                      {txn.status ?? "cleared"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={`font-semibold ${
                        txn.type === "income"
                          ? "text-emerald-500"
                          : txn.type === "expense"
                          ? "text-rose-500"
                          : "text-blue-500"
                      }`}
                    >
                      {txn.type === "income" ? "+" : "-"}
                      {formatCurrency(txn.amount)}
                    </span>
                    {txn.fee > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Fee: {formatCurrency(txn.fee)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                          <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(txn)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(txn.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination — hidden while an AI filter is active (AI results aren't paged) */}
      {!aiResult && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Transaction Form Dialog */}
      <TransactionForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditingTransaction(null);
            loadData();
          }
        }}
        accounts={accounts}
        categories={categories}
        transaction={editingTransaction}
      />
    </div>
  );
}
