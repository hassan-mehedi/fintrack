import dynamic from "next/dynamic";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { AnomaliesCard } from "@/components/analytics/insight-cards";
import { AccountCards } from "@/components/dashboard/account-cards";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { GoalsSummary } from "@/components/goals/goals-summary";
import { getGoals } from "@/lib/actions/goals";
import { ChartSkeleton } from "@/components/dashboard/skeletons";
import type { FinancialAccount } from "@fintrack/shared/types";
import { loadDashboard, loadNetWorthHistory } from "./data";

const SpendingChart = dynamic(
  () =>
    import("@/components/dashboard/spending-chart").then(
      (mod) => mod.SpendingChart
    ),
  { loading: () => <ChartSkeleton /> }
);

const TrendChart = dynamic(
  () =>
    import("@/components/dashboard/trend-chart").then(
      (mod) => mod.TrendChart
    ),
  { loading: () => <ChartSkeleton /> }
);

const NetWorthChart = dynamic(
  () =>
    import("@/components/dashboard/net-worth-chart").then(
      (mod) => mod.NetWorthChart
    ),
  { loading: () => <ChartSkeleton /> }
);

interface RangeProps {
  from: string;
  to: string;
}

export async function SummarySection({ from, to }: RangeProps) {
  const data = await loadDashboard(from, to);
  return (
    <>
      <SummaryCards
        spendableBalance={data.spendableBalance}
        totalAssets={data.totalAssets}
        totalLiabilities={data.totalLiabilities}
        netWorth={data.netWorth}
        monthlyIncome={data.monthlyIncome}
        monthlyExpense={data.monthlyExpense}
        monthlyFees={data.monthlyFees}
        totalSavings={data.totalSavings}
        monthlySavings={data.monthlySavings}
        from={from}
        to={to}
      />
      <AnomaliesCard anomalies={data.anomalies} detailsHref="/analytics" />
    </>
  );
}

export async function AccountsSection({ from, to }: RangeProps) {
  const data = await loadDashboard(from, to);
  return <AccountCards accounts={data.accounts as FinancialAccount[]} />;
}

export async function ChartsSection({ from, to }: RangeProps) {
  const data = await loadDashboard(from, to);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SpendingChart data={data.spendingByCategory} from={from} to={to} />
      <TrendChart data={data.monthlyTrend} />
    </div>
  );
}

export async function NetWorthSection() {
  const history = await loadNetWorthHistory();
  return <NetWorthChart history={history} />;
}

export async function GoalsSection() {
  const goals = await getGoals();
  if (goals.length === 0) return null;
  return <GoalsSummary goals={goals} />;
}

export async function RecentTransactionsSection({ from, to }: RangeProps) {
  const data = await loadDashboard(from, to);
  return <RecentTransactions transactions={data.recentTransactions} />;
}
