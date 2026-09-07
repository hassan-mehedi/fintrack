import {
  AccountCardsSkeleton,
  BlockSkeleton,
  ChartPairSkeleton,
  ChartSkeleton,
  HeaderSkeleton,
  SummaryCardsSkeleton,
} from "@/components/dashboard/skeletons";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <SummaryCardsSkeleton />
      <AccountCardsSkeleton />
      <ChartPairSkeleton />
      <ChartSkeleton />
      <BlockSkeleton className="h-[400px]" />
    </div>
  );
}
