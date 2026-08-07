"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { transactionSchema, type TransactionInput } from "@fintrack/shared/validators";
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
import { useCurrency } from "@/components/providers/currency-provider";
import type { FinancialAccount, Category } from "@fintrack/shared/types";

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
  tags: string[];
  currency?: string | null;
  toCurrency?: string | null;
  amountReceived?: string | null;
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
  const baseCurrency = useCurrency();

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
        tags: [],
        currency: null,
        toCurrency: null,
        amountReceived: "",
      });
    }
  }, [transaction, open]);

  const transactionType = form.watch("type");
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

  // Filter categories based on transaction type
  const filteredCategories = categories.filter(
    (cat) => cat.type === transactionType || cat.type === "both"
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
    setIsLoading(true);
    try {
      if (isEditing) {
        await updateTransaction(transaction.id, data);
        toast.success("Transaction updated successfully");
      } else {
        await createTransaction(data);
        toast.success("Transaction added successfully");
      }
      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(isEditing ? "Failed to update transaction" : "Failed to add transaction");
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
                        onValueChange={(value) => {
                          field.onChange(value);
                          form.setValue("toCurrency", null);
                        }}
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

            {/* Currency side pickers for dual-currency accounts */}
            {(sideOptions(sourceAccount) ||
              (transactionType === "transfer" && sideOptions(destAccount))) && (
              <div className="grid grid-cols-2 gap-4">
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
