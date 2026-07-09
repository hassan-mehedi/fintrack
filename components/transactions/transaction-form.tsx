"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { transactionSchema, type TransactionInput } from "@/lib/validators";
import { createTransaction, updateTransaction } from "@/lib/actions/transactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import type { FinancialAccount, Category } from "@/lib/types";
import { MerchantInput } from "@/components/transactions/merchant-input";
import { ReceiptUploader, type OcrFields } from "@/components/transactions/receipt-uploader";
import { SplitsEditor, type SplitChildRow } from "@/components/transactions/splits-editor";
import { TemplateChips } from "@/components/transactions/template-chips";
import { getSplitChildren } from "@/lib/actions/transactions";
import { enqueueTransaction } from "@/lib/offline/queue";
import { Switch } from "@/components/ui/switch";

interface TransactionForEdit {
  id: string;
  type: "income" | "expense" | "transfer";
  amount: number;
  fee: number;
  description: string;
  date: string;
  accountId: string;
  categoryId: string;
  toAccountId: string | null;
  merchantId?: string | null;
  tags: string[];
}

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: FinancialAccount[];
  categories: Category[];
  transaction?: TransactionForEdit | null;
}

export function TransactionForm({
  open,
  onOpenChange,
  accounts,
  categories,
  transaction,
}: TransactionFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const isEditing = !!transaction;

  const [merchantName, setMerchantName] = useState("");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitRows, setSplitRows] = useState<SplitChildRow[]>([]);

  // Keep the form's `splits` field in sync with local UI state so the
  // resolver's refines (sum-matches-amount, conditional categoryId requirement)
  // see the same data the user sees.

  const form = useForm<TransactionInput>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: "expense",
      amount: "",
      fee: "0",
      description: "",
      date: format(new Date(), "yyyy-MM-dd"),
      accountId: accounts.find((a) => a.isDefault)?.id || accounts[0]?.id || "",
      categoryId: "",
      toAccountId: null,
      merchantId: null,
      tags: [],
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
        merchantId: transaction.merchantId ?? null,
        tags: transaction.tags || [],
      });
      setMerchantName("");
      // Load existing splits when editing.
      void (async () => {
        try {
          const children = await getSplitChildren(transaction.id);
          if (children.length > 0) {
            setSplitEnabled(true);
            setSplitRows(
              children.map((c) => ({
                categoryId: c.categoryId,
                amount: String(c.amount),
                description: c.description,
              })),
            );
          } else {
            setSplitEnabled(false);
            setSplitRows([]);
          }
        } catch {
          setSplitEnabled(false);
          setSplitRows([]);
        }
      })();
    } else if (open) {
      form.reset({
        type: "expense",
        amount: "",
        fee: "0",
        description: "",
        date: format(new Date(), "yyyy-MM-dd"),
        accountId: accounts.find((a) => a.isDefault)?.id || accounts[0]?.id || "",
        categoryId: "",
        toAccountId: null,
        merchantId: null,
        tags: [],
      });
      setMerchantName("");
      setSplitEnabled(false);
      setSplitRows([]);
    }
  }, [transaction, open, accounts, form]);

  const transactionType = form.watch("type");
  const selectedAccountId = form.watch("accountId");

  useEffect(() => {
    if (splitEnabled && transactionType !== "transfer") {
      form.setValue(
        "splits",
        splitRows.map((r) => ({
          categoryId: r.categoryId,
          amount: r.amount,
          description: r.description,
        })),
      );
    } else {
      form.setValue("splits", undefined);
    }
  }, [splitEnabled, splitRows, transactionType, form]);

  // Filter categories based on transaction type
  const filteredCategories = categories.filter(
    (cat) => cat.type === transactionType || cat.type === "both"
  );

  // Auto-fill fee from account's default fee rate
  const handleAccountChange = (accountId: string | null) => {
    if (!accountId) return;
    form.setValue("accountId", accountId);
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

  async function onSubmit(data: TransactionInput) {
    setIsLoading(true);
    try {
      const usingSplits =
        splitEnabled && data.type !== "transfer" && splitRows.length > 0;
      const payload: TransactionInput = {
        ...data,
        splits: usingSplits
          ? splitRows.map((r) => ({
              categoryId: r.categoryId,
              amount: r.amount,
              description: r.description,
            }))
          : undefined,
      };
      if (isEditing) {
        await updateTransaction(transaction.id, payload);
        toast.success("Transaction updated successfully");
      } else {
        // Offline-first: if the browser knows it's offline, queue locally.
        // The flusher drains the queue as soon as the connection returns.
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          await enqueueTransaction(payload);
          toast.success("Saved locally — will sync when online");
        } else {
          try {
            await createTransaction(payload);
            toast.success("Transaction added successfully");
          } catch (err) {
            // The classic "looked online but server unreachable" case —
            // common on flaky BD mobile connections. Stash it locally.
            const isNetworkError =
              err instanceof Error &&
              (err.message.includes("Failed to fetch") ||
                err.message.includes("NetworkError") ||
                err.message.includes("fetch failed"));
            if (isNetworkError) {
              await enqueueTransaction(payload);
              toast.success("Network blip — saved locally, will sync");
            } else {
              throw err;
            }
          }
        }
      }
      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isEditing
            ? "Failed to update transaction"
            : "Failed to add transaction",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Template chips — only when adding a new transaction. */}
            {!isEditing && (
              <TemplateChips
                onApply={(defaults) => {
                  // Reset only the fields the template specifies; preserve date.
                  form.reset({
                    ...form.getValues(),
                    accountId: defaults.accountId || form.getValues("accountId"),
                    categoryId: defaults.categoryId || form.getValues("categoryId"),
                    toAccountId: defaults.toAccountId,
                    amount: defaults.amount || form.getValues("amount"),
                    fee: defaults.fee || form.getValues("fee"),
                    type: defaults.type,
                    description: defaults.description,
                    tags: defaults.tags,
                  });
                  toast.success(`Loaded "${defaults.templateName}"`);
                }}
              />
            )}

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
                  <FormLabel>Amount</FormLabel>
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

            <div className="grid grid-cols-2 gap-4">
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
                    >
                      <FormControl>
                        <SelectTrigger>
                          {field.value ? (
                            <span className="flex flex-1 text-left truncate">
                              {accounts.find((a) => a.id === field.value)?.icon}{" "}
                              {accounts.find((a) => a.id === field.value)?.name}
                            </span>
                          ) : (
                            <SelectValue placeholder="Select account" />
                          )}
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.icon} {account.name}
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
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            {field.value ? (
                              <span className="flex flex-1 text-left truncate">
                                {accounts.find((a) => a.id === field.value)?.icon}{" "}
                                {accounts.find((a) => a.id === field.value)?.name}
                              </span>
                            ) : (
                              <SelectValue placeholder="Select account" />
                            )}
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {accounts
                            .filter((a) => a.id !== selectedAccountId)
                            .map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                {account.icon} {account.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : splitEnabled ? (
                <div className="flex items-end text-xs text-muted-foreground">
                  Category is set per split below.
                </div>
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
                      >
                        <FormControl>
                          <SelectTrigger>
                            {field.value ? (
                              <span className="flex flex-1 text-left truncate">
                                {filteredCategories.find((c) => c.id === field.value)?.icon}{" "}
                                {filteredCategories.find((c) => c.id === field.value)?.name}
                              </span>
                            ) : (
                              <SelectValue placeholder="Select category" />
                            )}
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredCategories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.icon} {cat.name}
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
                    >
                      <FormControl>
                        <SelectTrigger>
                          {field.value ? (
                            <span className="flex flex-1 text-left truncate">
                              {categories.find((c) => c.id === field.value)?.icon}{" "}
                              {categories.find((c) => c.id === field.value)?.name}
                            </span>
                          ) : (
                            <SelectValue placeholder="Select category" />
                          )}
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.icon} {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
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

            {/* Merchant (income/expense only) */}
            {transactionType !== "transfer" && (
              <FormField
                control={form.control}
                name="merchantId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Merchant</FormLabel>
                    <FormControl>
                      <MerchantInput
                        value={merchantName}
                        merchantId={field.value ?? null}
                        onChange={({ name, merchantId, defaultCategoryId }) => {
                          setMerchantName(name);
                          field.onChange(merchantId);
                          // Suggest the merchant's default category if the user hasn't picked one.
                          if (
                            defaultCategoryId &&
                            !form.getValues("categoryId") &&
                            filteredCategories.some((c) => c.id === defaultCategoryId)
                          ) {
                            form.setValue("categoryId", defaultCategoryId);
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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

            {/* Split toggle + editor (not allowed on transfers) */}
            {transactionType !== "transfer" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="font-medium text-sm">Split into multiple categories</p>
                    <p className="text-xs text-muted-foreground">
                      e.g. one Costco run that&apos;s groceries + household.
                    </p>
                  </div>
                  <Switch
                    checked={splitEnabled}
                    onCheckedChange={(v) => {
                      setSplitEnabled(v);
                      if (v && splitRows.length === 0) {
                        setSplitRows([
                          { categoryId: "", amount: "" },
                          { categoryId: "", amount: "" },
                        ]);
                      }
                    }}
                  />
                </div>
                {splitEnabled && (
                  <SplitsEditor
                    totalAmount={Number(form.watch("amount") || 0)}
                    categories={categories}
                    filteredCategories={filteredCategories}
                    value={splitRows}
                    onChange={setSplitRows}
                  />
                )}
              </div>
            )}

            {/* Receipts — only shown when editing an existing transaction */}
            {isEditing && transaction && (
              <ReceiptUploader
                transactionId={transaction.id}
                onApplyOcr={(ocr: OcrFields) => {
                  if (ocr.amount != null) form.setValue("amount", String(ocr.amount));
                  if (ocr.date) form.setValue("date", ocr.date);
                  if (ocr.merchantName) {
                    setMerchantName(ocr.merchantName);
                    // Defer merchant id resolution to MerchantInput on blur.
                    form.setValue("merchantId", null);
                  }
                  // Veryfi-shaped OCR may include line_items: surface them
                  // as a split suggestion the user can opt in to.
                  const lines = ocr.lineItems;
                  if (lines && lines.length >= 2) {
                    const rows = lines
                      .filter((l) => typeof l.total === "number" && l.total! > 0)
                      .map((l) => ({
                        categoryId: "",
                        amount: String(l.total),
                        description: l.description,
                      }));
                    if (rows.length >= 2) {
                      setSplitRows(rows);
                      setSplitEnabled(true);
                      toast.info(`${rows.length} line items pre-filled — pick a category for each`);
                      return;
                    }
                  }
                  toast.success("Receipt fields applied");
                }}
              />
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

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Update Transaction" : "Add Transaction"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
