import Link from "next/link";
import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Offline",
  description: "FinTrack is temporarily offline.",
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <WifiOff className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          FinTrack can still open its cached shell, but live account data and
          server actions need a connection.
        </p>
        <div className="mt-6 flex justify-center">
          <Button nativeButton={false} render={<Link href="/" />}>
            Try again
          </Button>
        </div>
      </div>
    </main>
  );
}
