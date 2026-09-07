"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import type { ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import {
  getTransactions,
  deleteTransaction,
  deleteTransactions,
  updateTransactionsCategory,
} from "@/lib/actions/transactions";
import { exportTransactionsCSV } from "@/lib/actions/export";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Copy,
  ChevronLeft,
  ChevronRight,
  Download,
  X,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { FinancialAccount, Category } from "@fintrack/shared/types";
import { DateRangePicker } from "@/components/layout/date-range-picker";
import { useFormatCurrency } from "@/components/providers/currency-provider";

type TransactionsResult = Awaited<ReturnType<typeof getTransactions>>;
type TransactionRow = TransactionsResult["transactions"][number];
type EditingTransaction = NonNullable<
  ComponentProps<typeof TransactionForm>["transaction"]
>;

const TYPE_FILTER_ITEMS = [
  { value: "all", label: "All Types" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "transfer", label: "Transfer" },
];

interface InitialFilters {
  categoryId?: string;
  accountId?: string;
  type?: string;
}

interface TransactionsClientProps {
  initialAccounts: FinancialAccount[];
  initialCategories: Category[];
  initialTxns: TransactionsResult;
  initialFrom: string;
  initialTo: string;
  initialFilters?: InitialFilters;
}

const TYPE_FILTERS = ["income", "expense", "transfer"];

function amountClass(type: TransactionRow["type"]) {
  if (type === "income") return "text-emerald-500";
  if (type === "expense") return "text-rose-500";
  return "text-blue-500";
}

function toFormValues(txn: TransactionRow): EditingTransaction {
  return {
    type: txn.type,
    amount: txn.amount,
    fee: txn.fee,
    description: txn.description,
    date: txn.date,
    accountId: txn.accountId,
    categoryId: txn.categoryId,
    toAccountId: txn.toAccountId,
    tags: txn.tags || [],
    currency: txn.currency,
    toCurrency: txn.toCurrency,
    amountReceived: txn.amountReceived,
  };
}

export function TransactionsClient({
  initialAccounts,
  initialCategories,
  initialTxns,
  initialFrom,
  initialTo,
  initialFilters,
}: TransactionsClientProps) {
  const formatCurrency = useFormatCurrency();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const [transactions, setTransactions] = useState<TransactionRow[]>(
    initialTxns.transactions
  );
  const [accounts] = useState<FinancialAccount[]>(initialAccounts);
  const [categories] = useState<Category[]>(initialCategories);
  const categoryItems = useMemo(
    () =>
      categories.map((cat) => ({
        value: cat.id,
        label: (
          <>
            {cat.icon} {cat.name}
          </>
        ),
      })),
    [categories]
  );
  const categoryFilterItems = useMemo(
    () => [{ value: "all", label: "All Categories" }, ...categoryItems],
    [categoryItems]
  );
  const accountFilterItems = useMemo(
    () => [
      { value: "all", label: "All Accounts" },
      ...accounts.map((account) => ({
        value: account.id,
        label: (
          <>
            {account.icon} {account.name}
            {account.isArchived ? " (archived)" : ""}
          </>
        ),
      })),
    ],
    [accounts]
  );
  const [total, setTotal] = useState(initialTxns.total);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialTxns.totalPages);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>(
    initialFilters?.type && TYPE_FILTERS.includes(initialFilters.type)
      ? initialFilters.type
      : "all"
  );
  const [categoryFilter, setCategoryFilter] = useState<string>(
    initialFilters?.categoryId || "all"
  );
  const [accountFilter, setAccountFilter] = useState<string>(
    initialFilters?.accountId || "all"
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<EditingTransaction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState<string | null>(null);
  const [isBulkWorking, setIsBulkWorking] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const dateFrom = fromParam || initialFrom;
  const dateTo = toParam || initialTo;

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

  const activeFilters = useMemo(
    () => ({
      type: typeFilter !== "all" ? typeFilter : undefined,
      categoryId: categoryFilter !== "all" ? categoryFilter : undefined,
      accountId: accountFilter !== "all" ? accountFilter : undefined,
      startDate: dateFrom,
      endDate: dateTo,
      search: debouncedSearch || undefined,
    }),
    [typeFilter, categoryFilter, accountFilter, dateFrom, dateTo, debouncedSearch]
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const txnData = await getTransactions({ page, ...activeFilters });
      setTransactions(txnData.transactions);
      setTotal(txnData.total);
      setTotalPages(txnData.totalPages);
      setSelectedIds(new Set());
    } catch {
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [page, activeFilters]);

  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    loadData();
  }, [loadData]);

  const handleDelete = async (id: string) => {
    try {
      await deleteTransaction(id);
      toast.success("Transaction deleted");
      loadData();
    } catch {
      toast.error("Failed to delete transaction");
    }
  };

  const handleEdit = (txn: TransactionRow) => {
    setEditingTransaction({ id: txn.id, ...toFormValues(txn) });
    setFormOpen(true);
  };

  const handleDuplicate = (txn: TransactionRow) => {
    setEditingTransaction({
      ...toFormValues(txn),
      date: format(new Date(), "yyyy-MM-dd"),
    });
    setFormOpen(true);
  };

  const handleExport = async () => {
    try {
      const csv = await exportTransactionsCSV(activeFilters);
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

  const allSelected =
    transactions.length > 0 && transactions.every((txn) => selectedIds.has(txn.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(transactions.map((txn) => txn.id)) : new Set());
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    setIsBulkWorking(true);
    try {
      await deleteTransactions([...selectedIds]);
      toast.success(`${selectedIds.size} transactions deleted`);
      setBulkDeleteOpen(false);
      loadData();
    } catch {
      toast.error("Failed to delete transactions");
    } finally {
      setIsBulkWorking(false);
    }
  };

  const handleBulkCategory = async () => {
    if (!bulkCategory) return;
    setIsBulkWorking(true);
    try {
      await updateTransactionsCategory([...selectedIds], bulkCategory);
      toast.success(`${selectedIds.size} transactions updated`);
      setBulkCategory(null);
      loadData();
    } catch {
      toast.error("Failed to change category");
    } finally {
      setIsBulkWorking(false);
    }
  };

  const renderAmount = (txn: TransactionRow, feeAsBadge = false) => {
    const currency = txn.currency ?? txn.accountCurrency;
    return (
      <>
        <span className={`font-semibold ${amountClass(txn.type)}`}>
          {txn.type === "income" ? "+" : "-"}
          {formatCurrency(txn.amount, false, currency)}
        </span>
        {txn.fee > 0 &&
          (feeAsBadge ? (
            <Badge variant="outline" className="mt-1 text-[10px] px-1 py-0">
              Fee {formatCurrency(txn.fee, false, currency)}
            </Badge>
          ) : (
            <p className="text-xs text-muted-foreground">
              Fee: {formatCurrency(txn.fee, false, currency)}
            </p>
          ))}
      </>
    );
  };

  const renderMenu = (txn: TransactionRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleEdit(txn)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDuplicate(txn)}>
          <Copy className="mr-2 h-4 w-4" />
          Duplicate
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
  );

  const renderTags = (txn: TransactionRow) =>
    txn.tags && txn.tags.length > 0 ? (
      <div className="flex flex-wrap gap-1 mt-0.5">
        {txn.tags.map((tag: string) => (
          <Badge key={tag} variant="outline" className="text-[10px] px-1 py-0">
            {tag}
          </Badge>
        ))}
      </div>
    ) : null;

  const emptyMessage = isLoading ? "Loading..." : "No transactions found";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">{total} transactions found</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <DateRangePicker />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={handleExport}>
              <Download className="mr-1 h-4 w-4" /> Export
            </Button>
            <Button className="flex-1 sm:flex-none" onClick={() => { setEditingTransaction(null); setFormOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
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
          items={TYPE_FILTER_ITEMS}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_FILTER_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v ?? "all");
            setPage(1);
          }}
          items={categoryFilterItems}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {categoryFilterItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={accountFilter}
          onValueChange={(v) => {
            setAccountFilter(v ?? "all");
            setPage(1);
          }}
          items={accountFilterItems}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Account" />
          </SelectTrigger>
          <SelectContent>
            {accountFilterItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSelectedIds(new Set())}
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select
              value={bulkCategory}
              onValueChange={setBulkCategory}
              items={categoryItems}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Change category" />
              </SelectTrigger>
              <SelectContent>
                {categoryItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={!bulkCategory || isBulkWorking}
              onClick={handleBulkCategory}
            >
              Apply
            </Button>
            <Button
              variant="destructive"
              disabled={isBulkWorking}
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="mr-1 h-4 w-4" /> Delete ({selectedIds.size})
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} transactions?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Account balances are reversed for every
              deleted transaction.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkWorking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isBulkWorking}
              onClick={handleBulkDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Table */}
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={(checked) => toggleAll(checked)}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading || transactions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-10 text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((txn) => (
                <TableRow key={txn.id} data-state={selectedIds.has(txn.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(txn.id)}
                      onCheckedChange={(checked) => toggleOne(txn.id, checked)}
                      aria-label="Select transaction"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{txn.categoryIcon}</span>
                      <div>
                        <span className="font-medium">
                          {txn.description || txn.categoryName}
                        </span>
                        {renderTags(txn)}
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
                  <TableCell className="text-right">{renderAmount(txn)}</TableCell>
                  <TableCell>{renderMenu(txn)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Card list */}
      <div className="space-y-2 md:hidden">
        {isLoading || transactions.length === 0 ? (
          <div className="rounded-lg border py-10 text-center text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          transactions.map((txn) => (
            <div
              key={txn.id}
              className={`flex items-start gap-3 rounded-lg border p-3 ${
                selectedIds.has(txn.id) ? "bg-muted/40" : ""
              }`}
            >
              <Checkbox
                className="mt-1"
                checked={selectedIds.has(txn.id)}
                onCheckedChange={(checked) => toggleOne(txn.id, checked)}
                aria-label="Select transaction"
              />
              <span className="text-lg leading-none">{txn.categoryIcon}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {txn.description || txn.categoryName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {txn.accountName} &middot; {format(parseISO(txn.date), "MMM d, yyyy")}
                </p>
                {renderTags(txn)}
              </div>
              <div className="flex items-start gap-1">
                <div className="flex flex-col items-end text-sm">
                  {renderAmount(txn, true)}
                </div>
                {renderMenu(txn)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
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
