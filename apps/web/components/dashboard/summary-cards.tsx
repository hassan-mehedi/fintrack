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
  PiggyBank,
} from "lucide-react";
import {
  differenceInCalendarDays,
  endOfMonth,
  format,
  getDaysInMonth,
  parseISO,
  startOfMonth,
} from "date-fns";
import { useFormatCurrency } from "@/components/providers/currency-provider";

interface SummaryCardsProps {
  spendableBalance: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  monthlyIncome: number;
  monthlyExpense: number;
  monthlyFees: number;
  totalSavings: number;
  monthlySavings: number;
  from: string;
  to: string;
}

export const SummaryCards = memo(function SummaryCards({
  spendableBalance,
  totalAssets,
  totalLiabilities,
  netWorth,
  monthlyIncome,
  monthlyExpense,
  monthlyFees,
  totalSavings,
  monthlySavings,
  from,
  to,
}: SummaryCardsProps) {
  const formatCurrency = useFormatCurrency();
  const net = monthlyIncome - monthlyExpense;

  const hasSavings = totalSavings > 0 || monthlySavings > 0;

  const cards = useMemo(
    () => [
      {
        title: "Net Worth",
        value: formatCurrency(netWorth),
        icon: Wallet,
        className: netWorth >= 0 ? "text-primary" : "text-rose-500",
      },
      {
        title: "Expendable Money",
        value: formatCurrency(spendableBalance),
        hint: "Bank, mobile banking and cash — money you can spend now",
        icon: Wallet,
        className: "text-emerald-500",
      },
      {
        title: "Non-spendable Savings",
        value: formatCurrency(totalSavings),
        hint: "Locked in FDR/DPS — counted in net worth",
        icon: PiggyBank,
        className: "text-sky-500",
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
      ...(hasSavings
        ? [
            {
              title: "Saved This Month",
              value: formatCurrency(monthlySavings),
              icon: PiggyBank,
              className: monthlySavings > 0 ? "text-emerald-500" : "text-muted-foreground",
            },
          ]
        : []),
    ],
    [spendableBalance, totalAssets, totalLiabilities, netWorth, monthlyIncome, monthlyExpense, net, totalSavings, monthlySavings, hasSavings, formatCurrency]
  );

  const stats = useMemo(() => {
    const now = new Date();
    const isCurrentMonth =
      from === format(startOfMonth(now), "yyyy-MM-dd") &&
      to === format(endOfMonth(now), "yyyy-MM-dd");
    const daysInRange = Math.max(
      differenceInCalendarDays(parseISO(to), parseISO(from)) + 1,
      1
    );
    const daysElapsed = isCurrentMonth ? now.getDate() : daysInRange;
    const dailyAvg = monthlyExpense / daysElapsed;
    const savingsRate =
      monthlyIncome > 0 ? ((monthlyIncome - monthlyExpense) / monthlyIncome) * 100 : 0;

    const rows: { title: string; value: string; className: string; hint?: string }[] = [
      {
        title: "Savings rate",
        value: `${savingsRate.toFixed(1)}%`,
        className: savingsRate >= 0 ? "text-emerald-500" : "text-rose-500",
      },
      {
        title: "Fees paid",
        value: formatCurrency(monthlyFees),
        className: "text-amber-500",
      },
      {
        title: "Daily average expense",
        value: formatCurrency(dailyAvg),
        className: "text-foreground",
      },
    ];

    if (isCurrentMonth) {
      const daysLeft = getDaysInMonth(now) - daysElapsed;
      const forecast = monthlyExpense + dailyAvg * daysLeft;
      rows.push({
        title: "Projected month-end spend",
        value: formatCurrency(forecast),
        className: forecast > monthlyIncome ? "text-rose-500" : "text-foreground",
        hint: `Based on your daily average with ${daysLeft} days left${
          forecast > monthlyIncome ? " — exceeds this month's income" : ""
        }`,
      });
    }

    return rows;
  }, [from, to, monthlyIncome, monthlyExpense, monthlyFees, formatCurrency]);

  return (
    <div className="space-y-4">
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
              {"hint" in card && card.hint && (
                <p className="text-xs text-muted-foreground mt-1">{card.hint}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-lg font-semibold ${stat.className}`}>
                {stat.value}
              </p>
              {stat.hint && (
                <p className="text-xs text-muted-foreground mt-1">{stat.hint}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
});
