"use client";

import { useEffect, useState, useCallback } from "react";
import { getAccounts, createAccount, deleteAccount } from "@/lib/actions/accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "@/lib/validators";
import { ACCOUNT_TYPE_LABELS } from "@/lib/types";
import { isLiabilityAccount } from "@/lib/accounts";
import type { FinancialAccount } from "@/lib/types";
import { toast } from "sonner";
import { Plus, MoreHorizontal, Trash2, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const ACCOUNT_TYPES = [
  { value: "bank", label: "Bank" },
  { value: "mobile_banking", label: "Mobile Banking" },
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit Card" },
  { value: "loan", label: "Loan" },
  { value: "custom", label: "Custom" },
];

const ACCOUNT_ICONS = ["🏦", "📱", "💵", "💳", "🏧", "👛", "🪙", "💰"];

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const loadAccounts = useCallback(async () => {
    const data = await getAccounts();
    setAccounts(data as FinancialAccount[]);
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const form = useForm<FinancialAccountInput>({
    resolver: zodResolver(financialAccountSchema),
    defaultValues: {
      name: "",
      type: "bank",
      balance: "0",
      icon: "🏦",
      color: "#10b981",
      defaultFeeRate: "",
      creditLimit: "",
      isDefault: false,
    },
  });

  const watchedType = form.watch("type");
  const showLiabilityFields = watchedType === "credit_card" || watchedType === "loan";

  const onSubmit = async (data: FinancialAccountInput) => {
    setIsLoading(true);
    try {
      await createAccount(data);
      toast.success("Account created");
      form.reset();
      setFormOpen(false);
      loadAccounts();
    } catch {
      toast.error("Failed to create account");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAccount(id);
      toast.success("Account deleted");
      loadAccounts();
    } catch {
      toast.error("Failed to delete account");
    }
  };

  const assetAccounts = accounts.filter((a) => !isLiabilityAccount(a.type));
  const liabilityAccounts = accounts.filter((a) => isLiabilityAccount(a.type));
  const totalAssets = assetAccounts.reduce(
    (sum, acc) => sum + Number(acc.balance),
    0
  );
  const totalLiabilities = liabilityAccounts.reduce(
    (sum, acc) => sum + Number(acc.balance),
    0
  );
  const netWorth = totalAssets - totalLiabilities;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Accounts</h1>
          <p className="text-muted-foreground">
            Net worth: {formatCurrency(netWorth)}
            {totalLiabilities > 0 && (
              <span className="ml-2 text-xs">
                (Assets: {formatCurrency(totalAssets)} / Liabilities: {formatCurrency(totalLiabilities)})
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
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
                onDelete={handleDelete}
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
                onDelete={handleDelete}
                isLiability
              />
            ))}
          </div>
        </div>
      )}

      {/* Add Account Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Account</DialogTitle>
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

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ACCOUNT_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
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
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ACCOUNT_ICONS.map((icon) => (
                            <SelectItem key={icon} value={icon}>
                              {icon}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="balance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {showLiabilityFields ? "Current Amount Owed" : "Initial Balance"}
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

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Account
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccountCard({
  account,
  onDelete,
  isLiability,
}: {
  account: FinancialAccount;
  onDelete: (id: string) => void;
  isLiability?: boolean;
}) {
  const balance = Number(account.balance);
  const creditLimit = account.creditLimit ? Number(account.creditLimit) : null;

  return (
    <Card className={isLiability ? "border-amber-500/30" : ""}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{account.icon}</span>
          <div>
            <CardTitle className="text-base">{account.name}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {ACCOUNT_TYPE_LABELS[account.type]}
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
              <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => onDelete(account.id)}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
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
      </CardContent>
      {account.defaultFeeRate && Number(account.defaultFeeRate) > 0 && (
        <CardFooter className="text-xs text-muted-foreground pt-0">
          Default fee: {account.defaultFeeRate}%
        </CardFooter>
      )}
    </Card>
  );
}
