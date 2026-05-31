"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Monitor, Smartphone, X, AlertTriangle } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  listSessions,
  revokeSession,
  revokeAllSessions,
} from "@/lib/actions/sessions";

type Row = {
  jti: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date | null;
  isCurrent: boolean;
};

function isMobile(ua: string | null): boolean {
  if (!ua) return false;
  return /Android|iPhone|iPad|Mobile/i.test(ua);
}

function describeUA(ua: string | null): string {
  if (!ua) return "Unknown device";
  // Crude but useful: pick browser + OS.
  const browser =
    ua.match(/Edg\/[\d.]+/) ||
    ua.match(/Chrome\/[\d.]+/) ||
    ua.match(/Firefox\/[\d.]+/) ||
    ua.match(/Safari\/[\d.]+/);
  const os =
    ua.match(/Windows NT [\d.]+/) ||
    ua.match(/Mac OS X [\d_.]+/) ||
    ua.match(/Android [\d.]+/) ||
    ua.match(/iPhone OS [\d_]+/) ||
    ua.match(/Linux/);
  const browserStr = browser ? browser[0].split("/")[0] : "Browser";
  const osStr = os ? os[0] : "Unknown OS";
  return `${browserStr} · ${osStr}`;
}

export function SessionsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = (await listSessions()) as Row[];
      setRows(r);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const revoke = async (jti: string) => {
    setBusy(true);
    try {
      await revokeSession(jti);
      await refresh();
      toast.success("Session revoked");
    } catch {
      toast.error("Could not revoke session");
    } finally {
      setBusy(false);
    }
  };

  const revokeAll = async () => {
    if (!confirm("This will sign out all your devices, including this one. Continue?"))
      return;
    setBusy(true);
    try {
      await revokeAllSessions();
      toast.success("All sessions revoked — sign in again");
      // Hard navigate: every JWT is now invalid.
      window.location.href = "/login";
    } catch {
      toast.error("Could not revoke");
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
        <CardDescription>
          Each row is a browser or device signed in to your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tracked sessions.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((s) => {
              const Icon = isMobile(s.userAgent) ? Smartphone : Monitor;
              return (
                <li
                  key={s.jti}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{describeUA(s.userAgent)}</span>
                        {s.isCurrent && <Badge>This device</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.ipAddress ?? "Unknown IP"} · last seen{" "}
                        {formatDistanceToNowStrict(new Date(s.lastSeenAt), {
                          addSuffix: true,
                        })}
                      </div>
                    </div>
                  </div>
                  {!s.isCurrent && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => revoke(s.jti)}
                      disabled={busy}
                    >
                      <X className="mr-1 h-4 w-4" /> Revoke
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="pt-2">
          <Button
            variant="outline"
            onClick={revokeAll}
            disabled={busy || rows.length === 0}
          >
            <AlertTriangle className="mr-1 h-4 w-4" /> Sign out all devices
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
