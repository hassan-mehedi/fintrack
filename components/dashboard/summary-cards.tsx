"use client";

import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Landmark,
  CreditCard,
} from "lucide-react";
import { useFormatCurrency } from "@/components/providers/currency-provider";

interface SummaryCardsProps {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  monthlyIncome: number;
  monthlyExpense: number;
}

export const SummaryCards = memo(function SummaryCards({
  totalAssets,
  totalLiabilities,
  netWorth,
  monthlyIncome,
  monthlyExpense,
}: SummaryCardsProps) {
  const formatCurrency = useFormatCurrency();
  const net = monthlyIncome - monthlyExpense;

  const cards = useMemo(
    () => [
      {
        title: "Net Worth",
        value: formatCurrency(netWorth),
        icon: Wallet,
        className: netWorth >= 0 ? "text-primary" : "text-rose-500",
      },
      {
        title: "Total Assets",
        value: formatCurrency(totalAssets),
        icon: Landmark,
        className: "text-emerald-500",
      },
      {
        title: "Total Liabilities",
        value: formatCurrency(totalLiabilities),
        icon: CreditCard,
        className: totalLiabilities > 0 ? "text-amber-500" : "text-muted-foreground",
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
    [totalAssets, totalLiabilities, netWorth, monthlyIncome, monthlyExpense, net, formatCurrency]
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
