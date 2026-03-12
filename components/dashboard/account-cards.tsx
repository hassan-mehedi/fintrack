"use client";

import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ACCOUNT_TYPE_LABELS } from "@/lib/types";
import type { FinancialAccount } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface AccountCardsProps {
  accounts: FinancialAccount[];
}

export const AccountCards = memo(function AccountCards({
  accounts,
}: AccountCardsProps) {
  if (accounts.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {accounts.map((account) => (
        <Card key={account.id} className="min-w-[180px] flex-shrink-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{account.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{account.name}</p>
                <p className="text-xs text-muted-foreground">
                  {ACCOUNT_TYPE_LABELS[account.type] || account.type}
                </p>
              </div>
            </div>
            <p
              className="text-lg font-bold"
              style={{ color: account.color }}
            >
              {formatCurrency(Number(account.balance))}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
});
