"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
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
import { ShieldCheck, ShieldOff, Copy as CopyIcon, RefreshCw } from "lucide-react";
import {
  get2faStatus,
  startEnrollment,
  confirmEnrollment,
  disable2fa,
  regenerateRecoveryCodes,
  type TwoFactorStatus,
} from "@/lib/actions/2fa";

type EnrollmentState = {
  secret: string;
  qrDataUrl: string;
};

function copy(text: string, label: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(`${label} copied`))
    .catch(() => toast.error("Copy failed"));
}

function downloadCodes(codes: string[]) {
  const blob = new Blob(
    [
      "FinTrack recovery codes — keep this file somewhere safe.\nEach code works for one login if you lose your authenticator.\n\n",
      ...codes.map((c) => c + "\n"),
    ],
    { type: "text/plain" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fintrack-recovery-codes.txt";
  a.click();
  URL.revokeObjectURL(url);
}

export function TwoFactorPanel() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [enrollment, setEnrollment] = useState<EnrollmentState | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = (await get2faStatus()) as TwoFactorStatus;
      setStatus(s);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startEnroll = async () => {
    setBusy(true);
    try {
      const { secret, qrDataUrl } = await startEnrollment();
      setEnrollment({ secret, qrDataUrl });
      setEnrollCode("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start enrolment");
    } finally {
      setBusy(false);
    }
  };

  const confirmEnroll = async () => {
    setBusy(true);
    try {
      const { recoveryCodes } = await confirmEnrollment(enrollCode.trim());
      setEnrollment(null);
      setEnrollCode("");
      setNewCodes(recoveryCodes);
      await refresh();
      toast.success("Two-factor authentication enabled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await disable2fa({ password: disablePassword });
      setDisablePassword("");
      await refresh();
      toast.success("Two-factor authentication disabled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disable");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      const { recoveryCodes } = await regenerateRecoveryCodes();
      setNewCodes(recoveryCodes);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not regenerate");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Two-factor authentication
          {status?.enabled && <Badge>Enabled</Badge>}
          {!status?.enabled && <Badge variant="outline">Off</Badge>}
        </CardTitle>
        <CardDescription>
          Use an authenticator app (Google Authenticator, 1Password, Authy, …)
          to add a second factor at login.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Newly-issued recovery codes — shown ONCE */}
        {newCodes && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
            <p className="font-medium">Save these recovery codes now.</p>
            <p className="mb-2 text-xs text-muted-foreground">
              Each code works for one login if you lose your authenticator. They
              won&apos;t be shown again.
            </p>
            <div className="grid grid-cols-2 gap-1 font-mono text-xs">
              {newCodes.map((c) => (
                <code key={c} className="rounded bg-background px-2 py-1">
                  {c}
                </code>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copy(newCodes.join("\n"), "Codes")}
              >
                <CopyIcon className="mr-1 h-3.5 w-3.5" /> Copy all
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadCodes(newCodes)}
              >
                Download .txt
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNewCodes(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {/* Disabled — offer to enable */}
        {!status?.enabled && !enrollment && (
          <Button onClick={startEnroll} disabled={busy}>
            <ShieldCheck className="mr-1 h-4 w-4" /> Enable
          </Button>
        )}

        {/* Enrollment in progress: show QR + code input */}
        {!status?.enabled && enrollment && (
          <div className="space-y-3">
            <p className="text-sm">
              Scan this QR with your authenticator app, then enter the 6-digit
              code it shows.
            </p>
            <Image
              src={enrollment.qrDataUrl}
              alt="2FA QR code"
              width={240}
              height={240}
              unoptimized
              className="rounded-md border bg-white p-2"
            />
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Can&apos;t scan? Enter manually</summary>
              <div className="mt-2 flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 font-mono">
                  {enrollment.secret}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copy(enrollment.secret, "Secret")}
                >
                  <CopyIcon className="h-3.5 w-3.5" />
                </Button>
              </div>
            </details>
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                placeholder="123456"
                value={enrollCode}
                onChange={(e) => setEnrollCode(e.target.value)}
                maxLength={6}
                className="w-32"
              />
              <Button onClick={confirmEnroll} disabled={busy || !enrollCode.trim()}>
                Verify &amp; enable
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEnrollment(null);
                  setEnrollCode("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Enabled — offer regenerate + disable */}
        {status?.enabled && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {status.lastUsedAt
                ? `Last used ${new Date(status.lastUsedAt).toLocaleString()}.`
                : "Never used yet."}{" "}
              {status.unusedRecoveryCodes} recovery code
              {status.unusedRecoveryCodes === 1 ? "" : "s"} remaining.
            </div>
            <Button variant="outline" onClick={regenerate} disabled={busy}>
              <RefreshCw className="mr-1 h-4 w-4" /> Regenerate recovery codes
            </Button>
            <div className="rounded-md border p-3">
              <p className="font-medium">Disable two-factor authentication</p>
              <p className="mb-2 text-xs text-muted-foreground">
                Enter your password to confirm.
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  className="max-w-xs"
                />
                <Button
                  variant="destructive"
                  onClick={disable}
                  disabled={busy || !disablePassword}
                >
                  <ShieldOff className="mr-1 h-4 w-4" /> Disable
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
