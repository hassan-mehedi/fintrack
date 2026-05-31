"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Sparkles,
  X,
  TrendingUp,
  Copy as CopyIcon,
} from "lucide-react";
import { listInsights, dismissInsight } from "@/lib/actions/insights";

type InsightRow = {
  id: string;
  kind:
    | "duplicate"
    | "outlier"
    | "subscription_creep"
    | "cashflow_warning"
    | "weekly_digest"
    | "savings_tip"
    | "large_share"
    | "recurring_drift";
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  payload: unknown;
  createdAt: Date;
};

const KIND_ICON: Record<InsightRow["kind"], typeof Sparkles> = {
  duplicate: CopyIcon,
  outlier: TrendingUp,
  subscription_creep: TrendingUp,
  cashflow_warning: AlertTriangle,
  weekly_digest: Sparkles,
  savings_tip: Sparkles,
  large_share: TrendingUp,
  recurring_drift: TrendingUp,
};

const SEVERITY_BORDER: Record<InsightRow["severity"], string> = {
  critical: "border-rose-300 dark:border-rose-700",
  warning: "border-amber-300 dark:border-amber-700",
  info: "border-border",
};

const SEVERITY_BG: Record<InsightRow["severity"], string> = {
  critical: "bg-rose-50/50 dark:bg-rose-950/20",
  warning: "bg-amber-50/40 dark:bg-amber-950/20",
  info: "",
};

export function InsightCards({ max = 5 }: { max?: number }) {
  const [rows, setRows] = useState<InsightRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = (await listInsights({ limit: max })) as InsightRow[];
      setRows(r);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [max]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || rows.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Insights</span>
        <Badge variant="outline" className="text-[10px]">
          {rows.length}
        </Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const Icon = KIND_ICON[r.kind] ?? Sparkles;
          return (
            <Card
              key={r.id}
              className={`${SEVERITY_BORDER[r.severity]} ${SEVERITY_BG[r.severity]}`}
            >
              <CardContent className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-3">
                        {r.body}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={async () => {
                      await dismissInsight(r.id);
                      setRows((prev) => prev.filter((x) => x.id !== r.id));
                    }}
                    aria-label="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
