"use client";

import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ACCOUNT_TYPE_LABELS } from "@/lib/types";
import { isLiabilityAccount } from "@/lib/accounts";
import type { FinancialAccount } from "@/lib/types";
import { useFormatCurrency } from "@/components/providers/currency-provider";

interface AccountCardsProps {
  accounts: FinancialAccount[];
}

export const AccountCards = memo(function AccountCards({
  accounts,
}: AccountCardsProps) {
  if (accounts.length === 0) return null;

  const assetAccounts = accounts.filter((a) => !isLiabilityAccount(a.type));
  const liabilityAccounts = accounts.filter((a) => isLiabilityAccount(a.type));

  return (
    <div className="space-y-3">
      {assetAccounts.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Assets</p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {assetAccounts.map((account) => (
              <AccountCard key={account.id} account={account} />
            ))}
          </div>
        </div>
      )}
      {liabilityAccounts.length > 0 && (
        <div>
          <p className="text-xs font-medium text-amber-500 mb-2 uppercase tracking-wider">Liabilities</p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {liabilityAccounts.map((account) => (
              <AccountCard key={account.id} account={account} isLiability />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

function AccountCard({
  account,
  isLiability,
}: {
  account: FinancialAccount;
  isLiability?: boolean;
}) {
  const formatCurrency = useFormatCurrency();
  const balance = Number(account.balance);
  const creditLimit = account.creditLimit ? Number(account.creditLimit) : null;

  return (
    <Card className={`min-w-[180px] flex-shrink-0 ${isLiability ? "border-amber-500/30" : ""}`}>
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
          className={`text-lg font-bold ${isLiability && balance > 0 ? "text-amber-500" : ""}`}
          style={!isLiability || balance === 0 ? { color: account.color } : undefined}
        >
          {isLiability && balance > 0 ? `-${formatCurrency(balance)}` : formatCurrency(balance)}
        </p>
        {isLiability && balance > 0 && (
          <p className="text-xs text-muted-foreground mt-1">Owed</p>
        )}
        {creditLimit !== null && creditLimit > 0 && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Used</span>
              <span>{formatCurrency(creditLimit - balance)} / {formatCurrency(creditLimit)}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{ width: `${Math.min((balance / creditLimit) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
