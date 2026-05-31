"use client";

import { useCallback, useEffect, useState } from "react";
import { listInbox, acceptInboundMessage, ignoreInboundMessage, deleteInboundMessage } from "@/lib/actions/inbox";
import { getAccounts } from "@/lib/actions/accounts";
import { getCategories } from "@/lib/actions/categories";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Check, Trash2, EyeOff, Loader2 } from "lucide-react";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import type { FinancialAccount, Category } from "@/lib/types";

type StatusFilter = "parsed" | "needs_review" | "applied" | "ignored" | "failed";

type InboxRow = {
  id: string;
  source: "email" | "sms" | "statement_pdf";
  status: "received" | "parsed" | "needs_review" | "applied" | "ignored" | "failed";
  fromAddress: string | null;
  subject: string | null;
  receivedAt: Date;
  parsed: {
    amount?: number;
    fee?: number;
    direction?: "in" | "out";
    currency?: string | null;
    date?: string;
    merchant?: string | null;
    refId?: string | null;
    balanceAfter?: number | null;
    accountHint?: string | null;
    description?: string;
  } | null;
  templateId: string | null;
  confidence: string | null;
  transactionId: string | null;
  rawBody: string;
};

export default function InboxPage() {
  const [items, setItems] = useState<InboxRow[]>([]);
  const [tab, setTab] = useState<StatusFilter>("parsed");
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const formatCurrency = useFormatCurrency();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, accs, cats] = await Promise.all([
        listInbox({ status: tab, limit: 100 }),
        getAccounts(),
        getCategories(),
      ]);
      setItems(rows as InboxRow[]);
      setAccounts(accs as FinancialAccount[]);
      setCategories(cats as Category[]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inbox</h1>
        <p className="text-muted-foreground text-sm">
          Forwarded bank & MFS notifications. Accept to log as a transaction.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as StatusFilter)}>
        <TabsList>
          <TabsTrigger value="parsed">Ready</TabsTrigger>
          <TabsTrigger value="needs_review">Needs review</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
          <TabsTrigger value="applied">Applied</TabsTrigger>
          <TabsTrigger value="ignored">Ignored</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            Nothing here yet. Set up email forwarding or the SMS forwarder in Settings.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <InboxItem
              key={it.id}
              item={it}
              accounts={accounts}
              categories={categories}
              formatCurrency={formatCurrency}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface InboxItemProps {
  item: InboxRow;
  accounts: FinancialAccount[];
  categories: Category[];
  formatCurrency: (n: number) => string;
  onChanged: () => void;
}

function InboxItem({ item, accounts, categories, formatCurrency, onChanged }: InboxItemProps) {
  const [showRaw, setShowRaw] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const p = item.parsed;
  const direction = p?.direction === "in" ? "income" : "expense";
  const filteredCategories = categories.filter(
    (c) => c.type === direction || c.type === "both",
  );

  const accept = async () => {
    setBusy(true);
    try {
      await acceptInboundMessage({
        messageId: item.id,
        accountId: accountId ?? undefined,
        categoryId: categoryId ?? undefined,
      });
      toast.success("Transaction created");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not accept");
    } finally {
      setBusy(false);
    }
  };

  const ignore = async () => {
    setBusy(true);
    try {
      await ignoreInboundMessage(item.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteInboundMessage(item.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-1 pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">
            {p?.merchant ?? p?.description ?? item.subject ?? "Untitled"}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">{item.source}</Badge>
            <Badge variant={direction === "income" ? "default" : "secondary"}>
              {direction === "income" ? "Income" : "Expense"}
            </Badge>
            {item.templateId && (
              <Badge variant="outline" className="font-mono text-[10px]">
                {item.templateId}
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          From {item.fromAddress ?? "(unknown)"} ·{" "}
          {new Date(item.receivedAt).toLocaleString()}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {p && p.amount != null && (
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold">{formatCurrency(p.amount)}</span>
            {p.fee != null && p.fee > 0 && (
              <span className="text-xs text-muted-foreground">
                fee {formatCurrency(p.fee)}
              </span>
            )}
            {p.balanceAfter != null && (
              <span className="text-xs text-muted-foreground">
                balance after {formatCurrency(p.balanceAfter)}
              </span>
            )}
            {p.refId && (
              <span className="text-xs font-mono text-muted-foreground">
                {p.refId}
              </span>
            )}
          </div>
        )}

        {item.status === "parsed" || item.status === "needs_review" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={accountId ?? ""} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    p?.accountHint
                      ? `Auto-resolve "${p.accountHint}"`
                      : "Pick account"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.icon} {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryId ?? ""} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Auto-pick category" />
              </SelectTrigger>
              <SelectContent>
                {filteredCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {(item.status === "parsed" || item.status === "needs_review") && (
            <Button size="sm" onClick={accept} disabled={busy}>
              <Check className="mr-1 h-4 w-4" /> Accept
            </Button>
          )}
          {(item.status === "parsed" || item.status === "needs_review" || item.status === "failed") && (
            <Button size="sm" variant="outline" onClick={ignore} disabled={busy}>
              <EyeOff className="mr-1 h-4 w-4" /> Ignore
            </Button>
          )}
          {!item.transactionId && (
            <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowRaw((v) => !v)}
          >
            {showRaw ? "Hide raw" : "Show raw"}
          </Button>
        </div>

        {showRaw && (
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">
            {item.rawBody}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
