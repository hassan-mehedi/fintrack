"use client";

import { memo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { formatCurrency } from "@/lib/utils";

interface RecentTransaction {
  id: string;
  amount: number;
  fee: number;
  type: "income" | "expense" | "transfer";
  description: string;
  date: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  accountName: string;
}

interface RecentTransactionsProps {
  transactions: RecentTransaction[];
}

export const RecentTransactions = memo(function RecentTransactions({
  transactions,
}: RecentTransactionsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Transactions</CardTitle>
        <CardDescription>Your latest financial activity</CardDescription>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="flex h-[100px] items-center justify-center text-muted-foreground">
            No transactions yet
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((txn) => (
              <div
                key={txn.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{txn.categoryIcon}</span>
                  <div>
                    <p className="text-sm font-medium">
                      {txn.description || txn.categoryName}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{txn.accountName}</span>
                      <span>&middot;</span>
                      <span>{format(parseISO(txn.date), "MMM d")}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-semibold ${
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
                    <Badge variant="secondary" className="text-xs">
                      Fee: {formatCurrency(txn.fee)}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
