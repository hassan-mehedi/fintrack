export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-28 rounded bg-muted animate-pulse" />
        <div className="h-4 w-44 rounded bg-muted animate-pulse mt-2" />
      </div>
      <div className="grid gap-6 max-w-2xl">
        <div className="h-[120px] rounded-lg border bg-card animate-pulse" />
        <div className="h-[100px] rounded-lg border bg-card animate-pulse" />
      </div>
    </div>
  );
}
