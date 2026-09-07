"use client";

import { useState, useEffect, useMemo, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { transactionSchema, type TransactionInput } from "@fintrack/shared/validators";
import {
  createTransaction,
  replaceSplits,
  updateTransaction,
} from "@/lib/actions/transactions";
import { removeReceipt } from "@/lib/actions/receipts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Paperclip, Plus, X } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  useCurrency,
  useFormatCurrency,
} from "@/components/providers/currency-provider";
import type { FinancialAccount, Category } from "@fintrack/shared/types";
import {
  MAX_SPLIT_ROWS,
  emptySplitRow,
  splitRemainder,
  splitsReady,
  type SplitRow,
} from "./split-utils";

// Mirrors the server-side receipt limits without pulling core into the client bundle
const RECEIPT_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";
const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

interface SplitForEdit {
  categoryId: string;
  amount: string | number;
  note: string;
}

interface TransactionForEdit {
  id?: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  fee: number;
  description: string;
  date: string;
  accountId: string;
  categoryId: string;
  toAccountId: string | null;
  tags: string[];
  currency?: string | null;
  toCurrency?: string | null;
  amountReceived?: string | null;
  splits?: SplitForEdit[];
  receiptKey?: string | null;
  receiptName?: string | null;
}

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: FinancialAccount[];
  categories: Category[];
  transaction?: TransactionForEdit | null;
  receiptsEnabled?: boolean;
}

function toSplitRows(splits?: SplitForEdit[]): SplitRow[] {
  return (splits ?? []).map((s) => ({
    categoryId: s.categoryId,
    amount: String(s.amount),
    note: s.note,
  }));
}

function defaultAccountId(accounts: FinancialAccount[]) {
  const active = accounts.filter((a) => !a.isArchived);
  return active.find((a) => a.isDefault)?.id || active[0]?.id || "";
}

export function TransactionForm({
  open,
  onOpenChange,
  accounts,
  categories,
  transaction,
  receiptsEnabled = false,
}: TransactionFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitRows, setSplitRows] = useState<SplitRow[]>([]);
  const [receipt, setReceipt] = useState<{ key: string; name: string } | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const isEditing = !!transaction?.id;
  const isDuplicating = !!transaction && !transaction.id;
  const baseCurrency = useCurrency();
  const formatCurrency = useFormatCurrency();

  const form = useForm<TransactionInput>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: "expense",
      amount: "",
      fee: "0",
      description: "",
      date: format(new Date(), "yyyy-MM-dd"),
      accountId: defaultAccountId(accounts),
      categoryId: "",
      toAccountId: null,
      tags: [],
      currency: null,
      toCurrency: null,
      amountReceived: "",
    },
  });

  // Reset form when transaction changes (edit vs add)
  useEffect(() => {
    if (transaction) {
      form.reset({
        type: transaction.type,
        amount: String(transaction.amount),
        fee: String(transaction.fee),
        description: transaction.description,
        date: transaction.date,
        accountId: transaction.accountId,
        categoryId: transaction.categoryId,
        toAccountId: transaction.toAccountId,
        tags: transaction.tags || [],
        currency: (transaction.currency ?? null) as TransactionInput["currency"],
        toCurrency: (transaction.toCurrency ?? null) as TransactionInput["toCurrency"],
        amountReceived: transaction.amountReceived ?? "",
      });
      const rows = toSplitRows(transaction.splits);
      setSplitRows(rows);
      setSplitEnabled(rows.length > 0);
      setReceipt(
        transaction.id && transaction.receiptKey
          ? { key: transaction.receiptKey, name: transaction.receiptName || "Receipt" }
          : null
      );
    } else if (open) {
      form.reset({
        type: "expense",
        amount: "",
        fee: "0",
        description: "",
        date: format(new Date(), "yyyy-MM-dd"),
        accountId: defaultAccountId(accounts),
        categoryId: "",
        toAccountId: null,
        tags: [],
        currency: null,
        toCurrency: null,
        amountReceived: "",
      });
      setSplitRows([]);
      setSplitEnabled(false);
      setReceipt(null);
    }
  }, [transaction, open]);

  // The header dialog loads accounts after it opens, so the default account
  // is not known when the form first resets
  useEffect(() => {
    if (!open || transaction || accounts.length === 0) return;
    if (!form.getValues("accountId")) {
      form.setValue("accountId", defaultAccountId(accounts));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, open, transaction]);

  const transactionType = form.watch("type");
  const amountValue = Number(form.watch("amount") || 0);
  const canSplit = transactionType !== "transfer";
  const splitActive = splitEnabled && canSplit;
  const remaining = splitRemainder(amountValue, splitRows);
  const splitsValid = !splitActive || splitsReady(amountValue, splitRows);
  const selectedAccountId = form.watch("accountId");
  const selectedToAccountId = form.watch("toAccountId");
  const selectedCurrency = form.watch("currency");
  const selectedToCurrency = form.watch("toCurrency");

  const sourceAccount = accounts.find((a) => a.id === selectedAccountId);
  const destAccount = accounts.find((a) => a.id === selectedToAccountId);
  const primaryCurrencyOf = (account?: FinancialAccount) =>
    account?.currency || baseCurrency;
  const sourceEffectiveCurrency =
    selectedCurrency || primaryCurrencyOf(sourceAccount);
  const destEffectiveCurrency =
    selectedToCurrency || primaryCurrencyOf(destAccount);
  const isCrossCurrencyTransfer =
    transactionType === "transfer" &&
    !!destAccount &&
    sourceEffectiveCurrency !== destEffectiveCurrency;

  const sideOptions = (account?: FinancialAccount) =>
    account?.secondaryCurrency
      ? [primaryCurrencyOf(account), account.secondaryCurrency]
      : null;

  const accountItems = useMemo(
    () =>
      accounts
        .filter(
          (account) =>
            !account.isArchived ||
            account.id === transaction?.accountId ||
            account.id === transaction?.toAccountId
        )
        .map((account) => ({
          value: account.id,
          label: (
            <>
              {account.icon} {account.name}
              {account.isArchived ? " (archived)" : ""}
            </>
          ),
        })),
    [accounts, transaction?.accountId, transaction?.toAccountId]
  );
  const toAccountItems = useMemo(
    () => accountItems.filter((item) => item.value !== selectedAccountId),
    [accountItems, selectedAccountId]
  );
  const categoryItems = useMemo(
    () =>
      categories.map((cat) => ({
        value: cat.id,
        type: cat.type,
        label: (
          <>
            {cat.icon} {cat.name}
          </>
        ),
      })),
    [categories]
  );
  const filteredCategoryItems = useMemo(
    () =>
      categoryItems.filter(
        (item) => item.type === transactionType || item.type === "both"
      ),
    [categoryItems, transactionType]
  );

  // Auto-fill fee from account's default fee rate
  const handleAccountChange = (accountId: string | null) => {
    if (!accountId) return;
    form.setValue("accountId", accountId);
    form.setValue("currency", null);
    const account = accounts.find((a) => a.id === accountId);
    if (account?.defaultFeeRate && Number(account.defaultFeeRate) > 0) {
      const amount = Number(form.getValues("amount") || 0);
      if (amount > 0) {
        const fee = (amount * Number(account.defaultFeeRate)) / 100;
        form.setValue("fee", fee.toFixed(2));
      }
    }
  };

  // Recalculate fee when amount changes
  const handleAmountChange = (value: string) => {
    form.setValue("amount", value);
    const account = accounts.find((a) => a.id === selectedAccountId);
    if (account?.defaultFeeRate && Number(account.defaultFeeRate) > 0) {
      const amount = Number(value || 0);
      if (amount > 0) {
        const fee = (amount * Number(account.defaultFeeRate)) / 100;
        form.setValue("fee", fee.toFixed(2));
      }
    }
  };

  const toggleSplit = (checked: boolean) => {
    setSplitEnabled(checked);
    if (checked && splitRows.length === 0) {
      setSplitRows([emptySplitRow(), emptySplitRow()]);
    }
  };

  const updateSplitRow = (index: number, patch: Partial<SplitRow>) => {
    setSplitRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeSplitRow = (index: number) => {
    setSplitRows((rows) => rows.filter((_, i) => i !== index));
  };

  const addSplitRow = () => {
    setSplitRows((rows) => {
      const left = splitRemainder(amountValue, rows);
      return [...rows, { ...emptySplitRow(), amount: left > 0 ? left.toFixed(2) : "" }];
    });
  };

  async function handleReceiptUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file || !transaction?.id) return;
    if (file.size > RECEIPT_MAX_BYTES) {
      toast.error("Receipts must be 5 MB or smaller");
      input.value = "";
      return;
    }
    setReceiptBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/receipts/${transaction.id}`, { method: "POST", body });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        receiptKey?: string;
        receiptName?: string;
      };
      if (!response.ok || !payload.receiptKey) {
        throw new Error(payload.error || "Failed to upload receipt");
      }
      setReceipt({ key: payload.receiptKey, name: payload.receiptName || file.name });
      toast.success("Receipt attached");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload receipt");
    } finally {
      setReceiptBusy(false);
      input.value = "";
    }
  }

  async function handleReceiptRemove() {
    if (!transaction?.id) return;
    setReceiptBusy(true);
    try {
      await removeReceipt(transaction.id);
      setReceipt(null);
      toast.success("Receipt removed");
    } catch {
      toast.error("Failed to remove receipt");
    } finally {
      setReceiptBusy(false);
    }
  }

  async function saveSplits(transactionId: string) {
    const hadSplits = (transaction?.splits?.length ?? 0) > 0;
    const splits = splitActive
      ? splitRows.map((row) => ({
          categoryId: row.categoryId,
          amount: row.amount,
          note: row.note,
        }))
      : [];
    if (splits.length === 0 && !hadSplits) return;
    await replaceSplits(transactionId, { splits });
  }

  async function onSubmit(data: TransactionInput) {
    if (isCrossCurrencyTransfer && !Number(data.amountReceived || 0)) {
      toast.error(
        `This transfer converts ${sourceEffectiveCurrency} to ${destEffectiveCurrency} — enter the amount received in ${destEffectiveCurrency}.`
      );
      return;
    }
    if (!isCrossCurrencyTransfer) {
      data = { ...data, amountReceived: null };
    }
    if (!splitsValid) {
      toast.error("Split amounts must add up to the transaction amount");
      return;
    }
    setIsLoading(true);
    let savedId: string;
    try {
      if (transaction?.id) {
        await updateTransaction(transaction.id, data);
        savedId = transaction.id;
        toast.success("Transaction updated successfully");
      } else {
        const created = await createTransaction(data);
        savedId = created.id;
        toast.success("Transaction added successfully");
      }
    } catch {
      toast.error(isEditing ? "Failed to update transaction" : "Failed to add transaction");
      setIsLoading(false);
      return;
    }
    try {
      await saveSplits(savedId);
      form.reset();
      onOpenChange(false);
    } catch {
      toast.error("Transaction saved, but the splits could not be saved");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? "Edit Transaction"
              : isDuplicating
              ? "Duplicate Transaction"
              : "Add Transaction"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Transaction Type Toggle */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Tabs
                      value={field.value}
                      onValueChange={field.onChange}
                      className="w-full"
                    >
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger
                          value="expense"
                          className="data-[state=active]:bg-rose-500 data-[state=active]:text-white"
                        >
                          Expense
                        </TabsTrigger>
                        <TabsTrigger
                          value="income"
                          className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white"
                        >
                          Income
                        </TabsTrigger>
                        <TabsTrigger
                          value="transfer"
                          className="data-[state=active]:bg-blue-500 data-[state=active]:text-white"
                        >
                          Transfer
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount ({sourceEffectiveCurrency})</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="text-2xl font-bold h-14"
                      {...field}
                      onChange={(e) => handleAmountChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Account */}
              <FormField
                control={form.control}
                name="accountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {transactionType === "transfer"
                        ? "From Account"
                        : "Account"}
                    </FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={handleAccountChange}
                      items={accountItems}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accountItems.map((item) => (
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

              {/* To Account (transfers only) */}
              {transactionType === "transfer" ? (
                <FormField
                  control={form.control}
                  name="toAccountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>To Account</FormLabel>
                      <Select
                        value={field.value || ""}
                        onValueChange={(value) => {
                          field.onChange(value);
                          form.setValue("toCurrency", null);
                        }}
                        items={toAccountItems}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select account" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {toAccountItems.map((item) => (
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
              ) : (
                /* Category */
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        items={filteredCategoryItems}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredCategoryItems.map((item) => (
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
              )}
            </div>

            {/* Currency side pickers for dual-currency accounts */}
            {(sideOptions(sourceAccount) ||
              (transactionType === "transfer" && sideOptions(destAccount))) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {sideOptions(sourceAccount) && (
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency Side</FormLabel>
                        <Select
                          value={field.value || primaryCurrencyOf(sourceAccount)}
                          onValueChange={(value) =>
                            field.onChange(
                              value === primaryCurrencyOf(sourceAccount) ? null : value
                            )
                          }
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {sideOptions(sourceAccount)!.map((code) => (
                              <SelectItem key={code} value={code}>
                                {code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {transactionType === "transfer" && sideOptions(destAccount) && (
                  <FormField
                    control={form.control}
                    name="toCurrency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Destination Side</FormLabel>
                        <Select
                          value={field.value || primaryCurrencyOf(destAccount)}
                          onValueChange={(value) =>
                            field.onChange(
                              value === primaryCurrencyOf(destAccount) ? null : value
                            )
                          }
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {sideOptions(destAccount)!.map((code) => (
                              <SelectItem key={code} value={code}>
                                {code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            )}

            {/* Amount received for cross-currency transfers */}
            {isCrossCurrencyTransfer && (
              <FormField
                control={form.control}
                name="amountReceived"
                render={({ field }) => {
                  const sent = Number(form.watch("amount") || 0);
                  const received = Number(field.value || 0);
                  return (
                    <FormItem>
                      <FormLabel>
                        Amount Received ({destEffectiveCurrency})
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      {sent > 0 && received > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Rate: 1 {destEffectiveCurrency} ={" "}
                          {(sent / received).toFixed(2)} {sourceEffectiveCurrency}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            )}

            {/* Category for transfers too */}
            {transactionType === "transfer" && (
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
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
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Date */}
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Fee */}
              <FormField
                control={form.control}
                name="fee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Transaction Fee</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What's this transaction for?"
                      className="resize-none"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Split across categories */}
            {canSplit && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="split-toggle">Split across categories</Label>
                  <Switch
                    id="split-toggle"
                    checked={splitEnabled}
                    onCheckedChange={toggleSplit}
                  />
                </div>
                {splitEnabled && (
                  <div className="space-y-2">
                    {splitRows.map((row, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-[minmax(0,1fr)_96px_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_100px_minmax(0,1fr)_auto]"
                      >
                        <Select
                          value={row.categoryId || null}
                          onValueChange={(value) =>
                            updateSplitRow(index, { categoryId: value ?? "" })
                          }
                          items={filteredCategoryItems}
                        >
                          <SelectTrigger className="w-full" aria-label="Split category">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredCategoryItems.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          aria-label="Split amount"
                          value={row.amount}
                          onChange={(e) => updateSplitRow(index, { amount: e.target.value })}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 sm:order-last"
                          aria-label="Remove split row"
                          disabled={splitRows.length <= 1}
                          onClick={() => removeSplitRow(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Input
                          placeholder="Note (optional)"
                          aria-label="Split note"
                          maxLength={200}
                          className="col-span-3 sm:col-span-1"
                          value={row.note}
                          onChange={(e) => updateSplitRow(index, { note: e.target.value })}
                        />
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-xs">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={splitRows.length >= MAX_SPLIT_ROWS}
                        onClick={addSplitRow}
                      >
                        <Plus className="mr-1 h-3 w-3" /> Add row
                      </Button>
                      <span
                        className={
                          remaining === 0 ? "text-muted-foreground" : "font-medium text-destructive"
                        }
                      >
                        {remaining === 0
                          ? "Fully allocated"
                          : remaining > 0
                          ? `${formatCurrency(remaining, false, sourceEffectiveCurrency)} left to allocate`
                          : `${formatCurrency(-remaining, false, sourceEffectiveCurrency)} over`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Receipt (saved transactions only) */}
            {isEditing && receiptsEnabled && (
              <div className="space-y-2 rounded-lg border p-3">
                <Label htmlFor="receipt-file">Receipt</Label>
                {receipt ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <a
                      href={`/api/receipts/${transaction?.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate underline-offset-2 hover:underline"
                    >
                      {receipt.name}
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={receiptBusy}
                      onClick={handleReceiptRemove}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No receipt attached</p>
                )}
                <Input
                  id="receipt-file"
                  type="file"
                  accept={RECEIPT_ACCEPT}
                  disabled={receiptBusy}
                  onChange={handleReceiptUpload}
                />
                <p className="text-xs text-muted-foreground">
                  JPEG, PNG, WebP, HEIC or PDF up to 5 MB.
                </p>
              </div>
            )}

            {/* Tags */}
            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <FormControl>
                    <div>
                      <Input
                        placeholder="Type a tag and press Enter"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const input = e.currentTarget;
                            const value = input.value.trim();
                            if (value && !field.value.includes(value)) {
                              field.onChange([...field.value, value]);
                              input.value = "";
                            }
                          }
                        }}
                      />
                      {field.value.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {field.value.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="gap-1"
                            >
                              {tag}
                              <button
                                type="button"
                                onClick={() =>
                                  field.onChange(
                                    field.value.filter((t) => t !== tag)
                                  )
                                }
                                className="hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isLoading || !splitsValid}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Update Transaction" : "Add Transaction"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
