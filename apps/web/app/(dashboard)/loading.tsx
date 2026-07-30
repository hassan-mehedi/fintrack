export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-8 w-36 rounded bg-muted animate-pulse" />
          <div className="h-4 w-56 rounded bg-muted animate-pulse mt-2" />
        </div>
        <div className="h-8 w-40 rounded bg-muted animate-pulse" />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-[104px] rounded-lg border bg-card animate-pulse" />
        ))}
      </div>

      {/* Account Cards */}
      <div className="flex gap-3 overflow-hidden pb-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-[88px] min-w-[180px] rounded-lg border bg-card animate-pulse" />
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-[300px] rounded-lg border bg-card animate-pulse" />
        <div className="h-[300px] rounded-lg border bg-card animate-pulse" />
      </div>

      {/* Recent Transactions */}
      <div className="rounded-lg border bg-card animate-pulse h-[400px]" />
    </div>
  );
}
