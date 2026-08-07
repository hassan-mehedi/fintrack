"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { getTransactions } from "@/lib/actions/transactions";
import { deleteTransaction } from "@/lib/actions/transactions";
import { exportTransactionsCSV } from "@/lib/actions/export";
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
import { format, parseISO } from "date-fns";
import type { FinancialAccount, Category } from "@fintrack/shared/types";
import { DateRangePicker } from "@/components/layout/date-range-picker";
import { useFormatCurrency } from "@/components/providers/currency-provider";

type TransactionsResult = Awaited<ReturnType<typeof getTransactions>>;
type TransactionRow = TransactionsResult["transactions"][number];
type EditingTransaction = NonNullable<
  ComponentProps<typeof TransactionForm>["transaction"]
>;

interface TransactionsClientProps {
  initialAccounts: FinancialAccount[];
  initialCategories: Category[];
  initialTxns: TransactionsResult;
  initialFrom: string;
  initialTo: string;
}

export function TransactionsClient({
  initialAccounts,
  initialCategories,
  initialTxns,
  initialFrom,
  initialTo,
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
  const [total, setTotal] = useState(initialTxns.total);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialTxns.totalPages);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<EditingTransaction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
      tags: txn.tags || [],
      currency: txn.currency,
      toCurrency: txn.toCurrency,
      amountReceived: txn.amountReceived,
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
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  Loading...
                </TableCell>
              </TableRow>
            ) : transactions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-10 text-muted-foreground"
                >
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{txn.categoryIcon}</span>
                      <div>
                        <span className="font-medium">
                          {txn.description || txn.categoryName}
                        </span>
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
                      {formatCurrency(txn.amount, false, txn.currency ?? txn.accountCurrency)}
                    </span>
                    {txn.fee > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Fee: {formatCurrency(txn.fee, false, txn.currency ?? txn.accountCurrency)}
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
