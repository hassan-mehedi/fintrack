"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

export type SmartSearchResult = {
  filter: Record<string, unknown> | null;
  transactions: Array<{
    id: string;
    amount: number;
    fee: number;
    type: string;
    status: string;
    description: string;
    date: string;
    tags: string[];
    categoryId: string;
    categoryName: string;
    categoryIcon: string;
    categoryColor: string;
    accountId: string;
    accountName: string;
    toAccountId: string | null;
    merchantId: string | null;
    merchantName: string | null;
    isReimbursable: boolean;
    createdAt: string;
  }>;
  total: number;
};

interface SmartSearchProps {
  onResult: (result: SmartSearchResult | null) => void;
}

/**
 * Sparkly natural-language search. Calls /api/search/transactions which
 * runs gpt-4o-mini → Zod-validated filter → existing transactions query.
 *
 * When a result is active, the parent should render the AI result rows
 * instead of the normal getTransactions() list, and show the filter chips
 * returned by the server so the user knows what got parsed.
 */
export function SmartSearch({ onResult }: SmartSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeFilter, setActiveFilter] = useState<Record<string, unknown> | null>(null);

  const submit = async () => {
    if (!query.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/search/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      if (res.status === 429) {
        toast.error("Too many AI requests. Try again in a moment.");
        return;
      }
      if (!res.ok) throw new Error("Search failed");
      const data = (await res.json()) as SmartSearchResult;
      if (!data.filter || Object.keys(data.filter).length === 0) {
        toast.info("Couldn't extract a filter from that query.");
        return;
      }
      setActiveFilter(data.filter);
      onResult(data);
      setOpen(false);
    } catch {
      toast.error("Search failed");
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setActiveFilter(null);
    setQuery("");
    onResult(null);
  };

  if (activeFilter) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">AI filter active:</span>
        {Object.entries(activeFilter).map(([k, v]) => (
          <Badge key={k} variant="secondary" className="text-[10px]">
            {k}: {String(v)}
          </Badge>
        ))}
        <Button size="sm" variant="ghost" onClick={clear} className="ml-auto">
          <X className="mr-1 h-3.5 w-3.5" /> Clear
        </Button>
      </div>
    );
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1"
      >
        <Sparkles className="h-4 w-4" /> Ask
      </Button>
    );
  }

  return (
    <div className="flex w-full items-center gap-2 sm:w-[420px]">
      <Input
        autoFocus
        placeholder='e.g. "bKash payments over 500 last month"'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") setOpen(false);
        }}
        disabled={busy}
      />
      <Button size="sm" onClick={submit} disabled={busy || !query.trim()}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
