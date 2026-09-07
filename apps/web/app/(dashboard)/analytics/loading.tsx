import {
  BlockSkeleton,
  ChartPairSkeleton,
  HeaderSkeleton,
  StatCardsSkeleton,
} from "@/components/dashboard/skeletons";

export default function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton titleWidth="w-32" subtitleWidth="w-48" />
      <StatCardsSkeleton />
      <ChartPairSkeleton />
      <BlockSkeleton className="h-[300px]" />
    </div>
  );
}
