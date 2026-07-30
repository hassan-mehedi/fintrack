export default function AssistantLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="mb-4">
        <div className="h-8 w-36 rounded bg-muted animate-pulse" />
        <div className="h-4 w-72 rounded bg-muted animate-pulse mt-2" />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        {/* Chat area */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center space-y-3 max-w-md">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted animate-pulse" />
            <div className="h-5 w-40 mx-auto rounded bg-muted animate-pulse" />
            <div className="h-4 w-64 mx-auto rounded bg-muted animate-pulse" />
            <div className="space-y-2 pt-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 w-full rounded-lg border bg-card animate-pulse" />
              ))}
            </div>
          </div>
        </div>

        {/* Input area */}
        <div className="border-t p-4 flex gap-2">
          <div className="flex-1 h-10 rounded-lg border bg-muted animate-pulse" />
          <div className="h-10 w-10 rounded-lg bg-muted animate-pulse" />
        </div>
      </div>
    </div>
  );
}
