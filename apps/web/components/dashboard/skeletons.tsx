import { cn } from "@/lib/utils";

export function BlockSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card animate-pulse", className)} />
  );
}

export function HeaderSkeleton({
  titleWidth = "w-36",
  subtitleWidth = "w-56",
}: {
  titleWidth?: string;
  subtitleWidth?: string;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className={cn("h-8 rounded bg-muted animate-pulse", titleWidth)} />
        <div
          className={cn("h-4 rounded bg-muted animate-pulse mt-2", subtitleWidth)}
        />
      </div>
      <div className="h-8 w-40 rounded bg-muted animate-pulse" />
    </div>
  );
}

export function SummaryCardsSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <BlockSkeleton key={i} className="h-[104px]" />
        ))}
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <BlockSkeleton key={i} className="h-[84px]" />
        ))}
      </div>
    </>
  );
}

export function StatCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {[...Array(count)].map((_, i) => (
        <BlockSkeleton key={i} className="h-[100px]" />
      ))}
    </div>
  );
}

export function AccountCardsSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden pb-2">
      {[...Array(4)].map((_, i) => (
        <BlockSkeleton key={i} className="h-[88px] min-w-[180px]" />
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return <BlockSkeleton className="h-[300px]" />;
}

export function ChartPairSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ChartSkeleton />
      <ChartSkeleton />
    </div>
  );
}
