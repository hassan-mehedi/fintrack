import { getAccounts } from "@/lib/actions/accounts";
import { getGoals } from "@/lib/actions/goals";
import { monthlyNeeded } from "@fintrack/core/goals";
import type { FinancialAccount } from "@fintrack/shared/types";
import { GoalsClient } from "./goals-client";

export default async function GoalsPage() {
  const [goals, accounts] = await Promise.all([getGoals(), getAccounts()]);

  const goalsWithPace = goals.map((goal) => ({
    ...goal,
    monthlyNeeded: goal.completedAt
      ? null
      : monthlyNeeded(goal.remaining, goal.deadline),
  }));

  return (
    <GoalsClient goals={goalsWithPace} accounts={accounts as FinancialAccount[]} />
  );
}
