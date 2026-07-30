export default function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-8 w-32 rounded bg-muted animate-pulse" />
          <div className="h-4 w-48 rounded bg-muted animate-pulse mt-2" />
        </div>
        <div className="h-8 w-40 rounded bg-muted animate-pulse" />
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-[100px] rounded-lg border bg-card animate-pulse" />
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-[300px] rounded-lg border bg-card animate-pulse" />
        <div className="h-[300px] rounded-lg border bg-card animate-pulse" />
      </div>

      {/* Categories */}
      <div className="rounded-lg border bg-card animate-pulse h-[300px]" />
    </div>
  );
}
