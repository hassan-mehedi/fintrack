import { getAccounts } from "@/lib/actions/accounts";
import type { FinancialAccount } from "@/lib/types";
import { AccountsClient } from "./accounts-client";

export default async function AccountsPage() {
  const accounts = (await getAccounts()) as FinancialAccount[];

  return <AccountsClient accounts={accounts} />;
}
