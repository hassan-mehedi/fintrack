import { getRecurringTransactions } from "@/lib/actions/recurring";
import { getAccounts } from "@/lib/actions/accounts";
import { getCategories } from "@/lib/actions/categories";
import { isEmailConfigured } from "@/lib/email";
import type { FinancialAccount, Category } from "@fintrack/shared/types";
import { RecurringClient } from "./recurring-client";

export default async function RecurringPage() {
  const [rules, accounts, categories] = await Promise.all([
    getRecurringTransactions(),
    getAccounts(),
    getCategories(),
  ]);

  return (
    <RecurringClient
      rules={rules}
      accounts={accounts as FinancialAccount[]}
      categories={categories as Category[]}
      emailConfigured={isEmailConfigured()}
    />
  );
}
