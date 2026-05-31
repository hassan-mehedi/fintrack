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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Trash2 } from "lucide-react";
import {
  listSmsTokens,
  createSmsToken,
  revokeSmsToken,
} from "@/lib/actions/inbound-config";

type Token = {
  id: string;
  label: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

function copy(text: string, label: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(`${label} copied`))
    .catch(() => toast.error("Copy failed"));
}

export function InboundSettingsPanel() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [justCreated, setJustCreated] = useState<{ token: string; prefix: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const ts = (await listSmsTokens()) as Token[];
      setTokens(ts);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = async () => {
    if (!newLabel.trim()) return;
    setBusy(true);
    try {
      const t = await createSmsToken(newLabel.trim());
      setJustCreated({ token: t.token, prefix: t.prefix });
      setNewLabel("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create token");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    try {
      await revokeSmsToken(id);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>SMS forwarder tokens</CardTitle>
        <CardDescription>
          Used by Tasker / MacroDroid on your phone to POST transactional SMS to{" "}
          <code>/api/inbox/sms</code>. Tokens are shown once on creation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Label, e.g. 'Pixel 8'"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            disabled={busy}
          />
          <Button onClick={create} disabled={busy || !newLabel.trim()}>
            Create token
          </Button>
        </div>

        {justCreated && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
            <p className="font-medium">Save this token now — it won&apos;t be shown again.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">
                {justCreated.token}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copy(justCreated.token, "Token")}
              >
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setJustCreated(null)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {tokens.length > 0 && (
          <ul className="space-y-2">
            {tokens.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-md border p-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{t.label}</span>
                    <code className="text-xs text-muted-foreground">
                      ft_{t.prefix}…
                    </code>
                    {t.revokedAt && <Badge variant="secondary">Revoked</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    created {new Date(t.createdAt).toLocaleDateString()}
                    {t.lastUsedAt &&
                      ` · last used ${new Date(t.lastUsedAt).toLocaleDateString()}`}
                  </div>
                </div>
                {!t.revokedAt && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revoke(t.id)}
                    disabled={busy}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">MacroDroid / Tasker setup</summary>
          <ol className="ml-4 mt-2 list-decimal space-y-1">
            <li>Trigger: SMS Received. Filter senders: <code>bKash, NAGAD, DBBL, EBL, CITYBANK, UPAY, BRAC, ROCKET</code>.</li>
            <li>Action: HTTP POST to <code>/api/inbox/sms</code>.</li>
            <li>Headers: <code>Authorization: Bearer ft_…</code>, <code>Content-Type: application/json</code>.</li>
            <li>
              Body:{" "}
              <code>{`{"sender":"[sender]","body":"[message]","receivedAt":"[iso8601]"}`}</code>
            </li>
          </ol>
        </details>
      </CardContent>
    </Card>
  );
}
