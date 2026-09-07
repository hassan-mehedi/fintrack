import { Suspense } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { getTransactions } from "@/lib/actions/transactions";
import { getAccounts } from "@/lib/actions/accounts";
import { getCategories } from "@/lib/actions/categories";
import type { FinancialAccount, Category } from "@fintrack/shared/types";
import { TransactionsClient } from "./transactions-client";

interface TransactionsSearchParams {
  from?: string;
  to?: string;
  categoryId?: string;
  accountId?: string;
  type?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const;

function asUuid(value?: string) {
  return value && UUID_PATTERN.test(value) ? value : undefined;
}

function asTransactionType(value?: string) {
  return TRANSACTION_TYPES.find((t) => t === value);
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<TransactionsSearchParams>;
}) {
  const params = await searchParams;
  const dateFrom = params.from || format(startOfMonth(new Date()), "yyyy-MM-dd");
  const dateTo = params.to || format(endOfMonth(new Date()), "yyyy-MM-dd");
  const filters = {
    categoryId: asUuid(params.categoryId),
    accountId: asUuid(params.accountId),
    type: asTransactionType(params.type),
  };

  const [accounts, categories, txns] = await Promise.all([
    getAccounts({ includeArchived: true }),
    getCategories(),
    getTransactions({ page: 1, startDate: dateFrom, endDate: dateTo, ...filters }),
  ]);

  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>}>
      <TransactionsClient
        initialAccounts={accounts as FinancialAccount[]}
        initialCategories={categories as Category[]}
        initialTxns={txns}
        initialFrom={dateFrom}
        initialTo={dateTo}
        initialFilters={filters}
      />
    </Suspense>
  );
}
