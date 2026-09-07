"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  archiveAccount,
  createAccount,
  deleteAccount,
  unarchiveAccount,
  updateAccount,
} from "@/lib/actions/accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardFooter,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  financialAccountSchema,
  type FinancialAccountInput,
} from "@fintrack/shared/validators";
import { ACCOUNT_TYPE_LABELS } from "@fintrack/shared/types";
import { SUPPORTED_CURRENCIES } from "@fintrack/shared/currencies";
import { isLiabilityAccount } from "@fintrack/core/balance";
import type { FinancialAccount } from "@fintrack/shared/types";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Loader2,
  Pencil,
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  useCurrency,
  useFormatCurrency,
} from "@/components/providers/currency-provider";

const CURRENCY_ITEMS = SUPPORTED_CURRENCIES.map((c) => ({
  value: c.code,
  label: `${c.code} — ${c.name}`,
}));

const SECONDARY_CURRENCY_ITEMS = [
  { value: "none", label: "None" },
  ...SUPPORTED_CURRENCIES.map((c) => ({ value: c.code, label: c.code })),
];

const ACCOUNT_ICONS = ["🏦", "📱", "💵", "💳", "🏧", "👛", "🪙", "💰"];

function emptyAccountValues(baseCurrency: string): FinancialAccountInput {
  return {
    name: "",
    type: "bank",
    balance: "0",
    icon: "🏦",
    color: "#10b981",
    defaultFeeRate: "",
    creditLimit: "",
    currency: baseCurrency as FinancialAccountInput["currency"],
    secondaryCurrency: null,
    secondaryBalance: "",
    secondaryCreditLimit: "",
    isDefault: false,
  };
}

function accountToFormValues(
  account: FinancialAccount,
  baseCurrency: string
): FinancialAccountInput {
  return {
    name: account.name,
    type: account.type,
    balance: account.balance,
    icon: account.icon,
    color: account.color,
    defaultFeeRate: account.defaultFeeRate ?? "",
    creditLimit: account.creditLimit ?? "",
    currency: (account.currency ?? baseCurrency) as FinancialAccountInput["currency"],
    secondaryCurrency:
      (account.secondaryCurrency ?? null) as FinancialAccountInput["secondaryCurrency"],
    secondaryBalance: account.secondaryBalance ?? "",
    secondaryCreditLimit: account.secondaryCreditLimit ?? "",
    isDefault: account.isDefault,
  };
}

export function AccountsClient({ accounts }: { accounts: FinancialAccount[] }) {
  const router = useRouter();
  const baseCurrency = useCurrency();
  const formatCurrency = useFormatCurrency();
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<FinancialAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FinancialAccount | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const form = useForm<FinancialAccountInput>({
    resolver: zodResolver(financialAccountSchema),
    defaultValues: emptyAccountValues(baseCurrency),
  });

  useEffect(() => {
    if (!formOpen) return;
    form.reset(
      editingAccount
        ? accountToFormValues(editingAccount, baseCurrency)
        : emptyAccountValues(baseCurrency)
    );
  }, [editingAccount, formOpen, baseCurrency, form]);

  const watchedType = form.watch("type");
  const showLiabilityFields = watchedType === "credit_card" || watchedType === "loan";
  const watchedSecondaryCurrency = form.watch("secondaryCurrency");

  const openCreate = () => {
    setEditingAccount(null);
    setFormOpen(true);
  };

  const openEdit = (account: FinancialAccount) => {
    setEditingAccount(account);
    setFormOpen(true);
  };

  const onSubmit = async (data: FinancialAccountInput) => {
    setIsLoading(true);
    try {
      if (editingAccount) {
        await updateAccount(editingAccount.id, data);
        toast.success("Account updated");
      } else {
        await createAccount(data);
        toast.success("Account created");
      }
      setFormOpen(false);
      setEditingAccount(null);
      router.refresh();
    } catch {
      toast.error(editingAccount ? "Failed to update account" : "Failed to create account");
    } finally {
      setIsLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    try {
      await archiveAccount(archiveTarget.id);
      toast.success("Account archived");
      router.refresh();
    } catch {
      toast.error("Failed to archive account");
    } finally {
      setArchiveTarget(null);
    }
  };

  const handleUnarchive = async (id: string) => {
    try {
      await unarchiveAccount(id);
      toast.success("Account restored");
      router.refresh();
    } catch {
      toast.error("Failed to restore account");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAccount(deleteTarget.id);
      toast.success("Account deleted");
      router.refresh();
    } catch {
      toast.error("Failed to delete account");
    } finally {
      setDeleteTarget(null);
    }
  };

  const activeAccounts = accounts.filter((a) => !a.isArchived);
  const archivedAccounts = accounts.filter((a) => a.isArchived);
  const assetAccounts = activeAccounts.filter((a) => !isLiabilityAccount(a.type));
  const liabilityAccounts = activeAccounts.filter((a) => isLiabilityAccount(a.type));
  const inBaseCurrency = (a: FinancialAccount) =>
    !a.currency || a.currency === baseCurrency;
  const hasForeignAccounts = activeAccounts.some((a) => !inBaseCurrency(a));
  const totalAssets = assetAccounts
    .filter(inBaseCurrency)
    .reduce((sum, acc) => sum + Number(acc.balance), 0);
  const totalLiabilities = liabilityAccounts
    .filter(inBaseCurrency)
    .reduce((sum, acc) => sum + Number(acc.balance), 0);
  const netWorth = totalAssets - totalLiabilities;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Accounts</h1>
          <p className="text-muted-foreground">
            Net worth: {formatCurrency(netWorth)}
            {totalLiabilities > 0 && (
              <span className="ml-2 text-xs">
                (Assets: {formatCurrency(totalAssets)} / Liabilities: {formatCurrency(totalLiabilities)})
              </span>
            )}
            {hasForeignAccounts && (
              <span className="ml-2 text-xs">
                — foreign-currency accounts not included
              </span>
            )}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Add Account
        </Button>
      </div>

      {assetAccounts.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            Assets
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {assetAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onEdit={openEdit}
                onArchive={setArchiveTarget}
              />
            ))}
          </div>
        </div>
      )}

      {liabilityAccounts.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-amber-500 mb-3 uppercase tracking-wider">
            Liabilities
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {liabilityAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onEdit={openEdit}
                onArchive={setArchiveTarget}
                isLiability
              />
            ))}
          </div>
        </div>
      )}

      {archivedAccounts.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? (
              <ChevronUp className="mr-1 h-4 w-4" />
            ) : (
              <ChevronDown className="mr-1 h-4 w-4" />
            )}
            {showArchived ? "Hide" : "Show"} archived ({archivedAccounts.length})
          </Button>
          {showArchived && (
            <div className="mt-3 grid gap-4 opacity-60 sm:grid-cols-2 lg:grid-cols-3">
              {archivedAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  isLiability={isLiabilityAccount(account.type)}
                  onUnarchive={handleUnarchive}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingAccount(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAccount ? "Edit Account" : "Add Account"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Dutch Bangla Bank" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        items={ACCOUNT_TYPE_LABELS}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
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
                  name="icon"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Icon</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Any emoji"
                          className="text-lg"
                          {...field}
                        />
                      </FormControl>
                      <div className="flex flex-wrap gap-1">
                        {ACCOUNT_ICONS.map((icon) => (
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
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="balance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {showLiabilityFields
                          ? "Current Amount Owed"
                          : editingAccount
                          ? "Balance"
                          : "Initial Balance"}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="defaultFeeRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Fee Rate (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="e.g., 1.85"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <Select
                        value={field.value || baseCurrency}
                        onValueChange={field.onChange}
                        items={CURRENCY_ITEMS}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CURRENCY_ITEMS.map((item) => (
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

                {showLiabilityFields && (
                  <FormField
                    control={form.control}
                    name="creditLimit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Credit Limit</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="e.g., 50000.00"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {showLiabilityFields && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="secondaryCurrency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>2nd Currency</FormLabel>
                        <Select
                          value={field.value || "none"}
                          onValueChange={(value) =>
                            field.onChange(value === "none" ? null : value)
                          }
                          items={SECONDARY_CURRENCY_ITEMS}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {SECONDARY_CURRENCY_ITEMS.map((item) => (
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

                  {watchedSecondaryCurrency && (
                    <>
                      <FormField
                        control={form.control}
                        name="secondaryBalance"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Owed ({watchedSecondaryCurrency})
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="secondaryCreditLimit"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Limit ({watchedSecondaryCurrency})
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </div>
              )}

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

              <FormField
                control={form.control}
                name="isDefault"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Default account</FormLabel>
                      <FormDescription>
                        Preselected when adding a transaction
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingAccount ? "Save Changes" : "Create Account"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiveTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its transactions stay in your history. The account disappears
              from transaction forms and from your totals until you restore it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the account and every transaction
              recorded on it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AccountCard({
  account,
  onEdit,
  onArchive,
  onUnarchive,
  onDelete,
  isLiability,
}: {
  account: FinancialAccount;
  onEdit?: (account: FinancialAccount) => void;
  onArchive?: (account: FinancialAccount) => void;
  onUnarchive?: (id: string) => void;
  onDelete?: (account: FinancialAccount) => void;
  isLiability?: boolean;
}) {
  const format = useFormatCurrency();
  const balance = Number(account.balance);
  const creditLimit = account.creditLimit ? Number(account.creditLimit) : null;
  const formatCurrency = (amount: number) => format(amount, false, account.currency);
  const secondaryBalance = Number(account.secondaryBalance || 0);
  const secondaryLimit = account.secondaryCreditLimit
    ? Number(account.secondaryCreditLimit)
    : null;
  const formatSecondary = (amount: number) =>
    format(amount, false, account.secondaryCurrency);

  return (
    <Card className={isLiability ? "border-amber-500/30" : ""}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{account.icon}</span>
          <div>
            <CardTitle className="text-base">{account.name}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {ACCOUNT_TYPE_LABELS[account.type]}
              {account.currency ? ` · ${account.currency}` : ""}
              {account.isDefault ? " · Default" : ""}
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
              <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit && (
              <DropdownMenuItem onClick={() => onEdit(account)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
            )}
            {onArchive && (
              <DropdownMenuItem onClick={() => onArchive(account)}>
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </DropdownMenuItem>
            )}
            {onUnarchive && (
              <DropdownMenuItem onClick={() => onUnarchive(account.id)}>
                <ArchiveRestore className="mr-2 h-4 w-4" />
                Unarchive
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem
                onClick={() => onDelete(account)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        <p
          className={`text-2xl font-bold ${isLiability && balance > 0 ? "text-amber-500" : ""}`}
          style={!isLiability || balance === 0 ? { color: account.color } : undefined}
        >
          {isLiability && balance > 0
            ? `-${formatCurrency(balance)}`
            : formatCurrency(balance)}
        </p>
        {isLiability && balance > 0 && (
          <p className="text-xs text-muted-foreground mt-1">Amount owed</p>
        )}
        {creditLimit !== null && creditLimit > 0 && (
          <div className="mt-2">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Available credit</span>
              <span className="font-medium text-emerald-600">
                {formatCurrency(Math.max(creditLimit - balance, 0))}
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Used</span>
              <span>
                {formatCurrency(balance)} / {formatCurrency(creditLimit)}
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{
                  width: `${Math.min((balance / creditLimit) * 100, 100)}%`,
                }}
              />
            </div>
          </div>
        )}
        {account.secondaryCurrency && (
          <div className="mt-3 border-t pt-2">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              {account.secondaryCurrency} side
            </p>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Owed</span>
              <span className="font-medium text-amber-500">
                {formatSecondary(secondaryBalance)}
              </span>
            </div>
            {secondaryLimit !== null && secondaryLimit > 0 && (
              <>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Available credit</span>
                  <span className="font-medium text-emerald-600">
                    {formatSecondary(Math.max(secondaryLimit - secondaryBalance, 0))}{" "}
                    / {formatSecondary(secondaryLimit)}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500"
                    style={{
                      width: `${Math.min((secondaryBalance / secondaryLimit) * 100, 100)}%`,
                    }}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
      {account.defaultFeeRate && Number(account.defaultFeeRate) > 0 && (
        <CardFooter className="text-xs text-muted-foreground pt-0">
          Default fee: {account.defaultFeeRate}%
        </CardFooter>
      )}
    </Card>
  );
}
