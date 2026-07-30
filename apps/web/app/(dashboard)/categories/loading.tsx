export default function CategoriesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-32 rounded bg-muted animate-pulse" />
          <div className="h-4 w-52 rounded bg-muted animate-pulse mt-2" />
        </div>
        <div className="h-9 w-32 rounded bg-muted animate-pulse" />
      </div>
      <div>
        <div className="h-6 w-40 rounded bg-muted animate-pulse mb-3" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-[56px] rounded-lg border bg-card animate-pulse" />
          ))}
        </div>
      </div>
      <div>
        <div className="h-6 w-40 rounded bg-muted animate-pulse mb-3" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-[56px] rounded-lg border bg-card animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
