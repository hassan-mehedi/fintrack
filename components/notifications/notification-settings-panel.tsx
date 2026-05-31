"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Bell, BellOff } from "lucide-react";
import {
  enablePush,
  disablePush,
  getPermission,
  isPushSupported,
  isSubscribed,
} from "@/lib/push/client";
import { loadPreferences, updatePreferences } from "@/lib/actions/notifications";
import type { NotificationPreferences } from "@/lib/types";

export function NotificationSettingsPanel() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<string>("default");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const p = (await loadPreferences()) as NotificationPreferences;
        setPrefs(p);
      } catch {
        // ignore
      }
      setPermission(getPermission());
      setSubscribed(await isSubscribed());
    })();
  }, []);

  const supported = isPushSupported();

  const update = async (patch: Partial<NotificationPreferences>) => {
    setBusy(true);
    try {
      const next = (await updatePreferences(patch)) as NotificationPreferences;
      setPrefs(next);
    } catch {
      toast.error("Could not save preference");
    } finally {
      setBusy(false);
    }
  };

  const toggleSubscription = async () => {
    setBusy(true);
    try {
      if (subscribed) {
        await disablePush();
        setSubscribed(false);
        toast.success("Push notifications disabled");
      } else {
        await enablePush();
        setSubscribed(true);
        setPermission("granted");
        toast.success("Push notifications enabled");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not toggle push");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Get alerted on the events that matter — directly to your device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!supported ? (
          <p className="text-sm text-muted-foreground">
            This device or browser doesn&apos;t support web push.
          </p>
        ) : (
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="font-medium">Push to this device</p>
              <p className="text-xs text-muted-foreground">
                {permission === "denied"
                  ? "Blocked in browser — clear the site permission and retry."
                  : subscribed
                    ? "Subscribed — fintrack can send notifications to this browser."
                    : "Not subscribed."}
              </p>
            </div>
            <Button
              size="sm"
              variant={subscribed ? "outline" : "default"}
              onClick={toggleSubscription}
              disabled={busy || permission === "denied"}
            >
              {subscribed ? (
                <>
                  <BellOff className="mr-1 h-4 w-4" /> Disable
                </>
              ) : (
                <>
                  <Bell className="mr-1 h-4 w-4" /> Enable
                </>
              )}
            </Button>
          </div>
        )}

        {prefs && (
          <>
            <Toggle
              label="Inbox: ready to log"
              description="Push when a forwarded message is parsed and ready to accept."
              checked={prefs.notifyInboundParsed}
              onChange={(v) => update({ notifyInboundParsed: v })}
              disabled={busy}
            />
            <Toggle
              label="Inbox: needs review"
              description="Push when a parse is low-confidence and needs your eyes."
              checked={prefs.notifyInboundNeedsReview}
              onChange={(v) => update({ notifyInboundNeedsReview: v })}
              disabled={busy}
            />
            <Toggle
              label="Budget exceeded"
              description="Push the first time a category's monthly budget is crossed."
              checked={prefs.notifyBudgetExceeded}
              onChange={(v) => update({ notifyBudgetExceeded: v })}
              disabled={busy}
            />
            <ToggleWithNumber
              label="Budget warning"
              description="Push when a category crosses a percentage of its monthly budget."
              checked={prefs.notifyBudgetWarning}
              numberValue={prefs.budgetWarningPercent}
              numberSuffix="%"
              onCheckedChange={(v) => update({ notifyBudgetWarning: v })}
              onNumberChange={(n) => update({ budgetWarningPercent: n })}
              disabled={busy}
            />
            <ToggleWithNumber
              label="Large transaction"
              description="Push for any single expense at or above this amount."
              checked={prefs.notifyLargeTransaction}
              numberValue={
                prefs.largeTransactionThreshold
                  ? Number(prefs.largeTransactionThreshold)
                  : 0
              }
              onCheckedChange={(v) => update({ notifyLargeTransaction: v })}
              onNumberChange={(n) =>
                update({ largeTransactionThreshold: n > 0 ? String(n) : null })
              }
              disabled={busy}
            />
            <ToggleWithNumber
              label="Bill due reminders"
              description="Days before a recurring expense's next due date to alert."
              checked={prefs.notifyBillDueSoon}
              numberValue={prefs.billReminderDaysBefore}
              numberSuffix="d"
              onCheckedChange={(v) => update({ notifyBillDueSoon: v })}
              onNumberChange={(n) => update({ billReminderDaysBefore: n })}
              disabled={busy}
            />
            <ToggleWithNumber
              label="Low balance"
              description="Alert when any asset account drops below this amount."
              checked={prefs.notifyLowBalance}
              numberValue={
                prefs.lowBalanceThreshold ? Number(prefs.lowBalanceThreshold) : 0
              }
              onCheckedChange={(v) => update({ notifyLowBalance: v })}
              onNumberChange={(n) =>
                update({ lowBalanceThreshold: n > 0 ? String(n) : null })
              }
              disabled={busy}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border p-3">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function ToggleWithNumber({
  label,
  description,
  checked,
  numberValue,
  numberSuffix,
  onCheckedChange,
  onNumberChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  numberValue: number;
  numberSuffix?: string;
  onCheckedChange: (v: boolean) => void;
  onNumberChange: (n: number) => void;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState(String(numberValue));
  useEffect(() => setLocal(String(numberValue)), [numberValue]);
  const commit = () => {
    const n = Number(local);
    if (!Number.isFinite(n)) return;
    onNumberChange(n);
  };
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border p-3">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
        {checked && (
          <div className="mt-2 flex items-center gap-2">
            <Input
              type="number"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              onBlur={commit}
              className="h-8 w-24"
              disabled={disabled}
            />
            {numberSuffix && (
              <span className="text-xs text-muted-foreground">{numberSuffix}</span>
            )}
          </div>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}
