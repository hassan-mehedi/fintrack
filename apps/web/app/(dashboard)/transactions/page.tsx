import { Suspense } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { getTransactions } from "@/lib/actions/transactions";
import { getAccounts } from "@/lib/actions/accounts";
import { getCategories } from "@/lib/actions/categories";
import type { FinancialAccount, Category } from "@fintrack/shared/types";
import { TransactionsClient } from "./transactions-client";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const dateFrom = params.from || format(startOfMonth(new Date()), "yyyy-MM-dd");
  const dateTo = params.to || format(endOfMonth(new Date()), "yyyy-MM-dd");

  const [accounts, categories, txns] = await Promise.all([
    getAccounts(),
    getCategories(),
    getTransactions({ page: 1, startDate: dateFrom, endDate: dateTo }),
  ]);

  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>}>
      <TransactionsClient
        initialAccounts={accounts as FinancialAccount[]}
        initialCategories={categories as Category[]}
        initialTxns={txns}
        initialFrom={dateFrom}
        initialTo={dateTo}
      />
    </Suspense>
  );
}
