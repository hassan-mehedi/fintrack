export default function RecurringLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-8 w-52 rounded bg-muted animate-pulse" />
          <div className="h-4 w-64 rounded bg-muted animate-pulse mt-2" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 rounded bg-muted animate-pulse" />
          <div className="h-9 w-24 rounded bg-muted animate-pulse" />
        </div>
      </div>
      <div className="grid gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-[88px] rounded-lg border bg-card animate-pulse" />
        ))}
      </div>
    </div>
  );
}
