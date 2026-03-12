"use client";

import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface SummaryCardsProps {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpense: number;
}

export const SummaryCards = memo(function SummaryCards({
  totalBalance,
  monthlyIncome,
  monthlyExpense,
}: SummaryCardsProps) {
  const net = monthlyIncome - monthlyExpense;

  const cards = useMemo(
    () => [
      {
        title: "Total Balance",
        value: formatCurrency(totalBalance),
        icon: Wallet,
        className: "text-primary",
      },
      {
        title: "Monthly Income",
        value: formatCurrency(monthlyIncome),
        icon: TrendingUp,
        className: "text-emerald-500",
      },
      {
        title: "Monthly Expenses",
        value: formatCurrency(monthlyExpense),
        icon: TrendingDown,
        className: "text-rose-500",
      },
      {
        title: "Net Balance",
        value: formatCurrency(net),
        icon: ArrowUpDown,
        className: net >= 0 ? "text-emerald-500" : "text-rose-500",
      },
    ],
    [totalBalance, monthlyIncome, monthlyExpense, net]
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className={`h-4 w-4 ${card.className}`} />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${card.className}`}>
              {card.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
});
