import { getAccounts } from "@/lib/actions/accounts";
import type { FinancialAccount } from "@fintrack/shared/types";
import { AccountsClient } from "./accounts-client";

export default async function AccountsPage() {
  const accounts = (await getAccounts({
    includeArchived: true,
  })) as FinancialAccount[];

  return <AccountsClient accounts={accounts} />;
}
