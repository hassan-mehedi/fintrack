export default function TransactionsLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-8 w-40 rounded bg-muted animate-pulse" />
          <div className="h-4 w-48 rounded bg-muted animate-pulse mt-2" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-40 rounded bg-muted animate-pulse" />
          <div className="h-8 w-20 rounded bg-muted animate-pulse" />
          <div className="h-8 w-16 rounded bg-muted animate-pulse" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="h-10 flex-1 min-w-[200px] rounded-md border bg-card animate-pulse" />
        <div className="h-10 w-[140px] rounded-md border bg-card animate-pulse" />
        <div className="h-10 w-[180px] rounded-md border bg-card animate-pulse" />
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <div className="h-12 border-b bg-muted/30 animate-pulse" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-14 border-b bg-card animate-pulse" style={{ opacity: 1 - i * 0.08 }} />
        ))}
      </div>
    </div>
  );
}
