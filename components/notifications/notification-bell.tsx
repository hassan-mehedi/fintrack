"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/actions/notifications";
import { formatDistanceToNowStrict } from "date-fns";

type Row = {
  id: string;
  kind: string;
  title: string;
  body: string;
  payload: { url?: string } | null;
  readAt: Date | null;
  createdAt: Date;
};

const POLL_MS = 60_000;

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [list, count] = await Promise.all([
        listNotifications(20),
        countUnreadNotifications(),
      ]);
      setRows(list as Row[]);
      setUnread(Number(count));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Also refresh when a service-worker push arrives — the SW shows the system
  // notification, and posts a message to clients so the bell stays in sync.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "fintrack:push-received") void refresh();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [refresh]);

  const handleClick = async (row: Row) => {
    setOpen(false);
    try {
      if (!row.readAt) await markNotificationRead(row.id);
    } catch {
      // ignore
    }
    void refresh();
    const url = row.payload?.url ?? "/";
    router.push(url);
  };

  const handleMarkAll = async () => {
    await markAllNotificationsRead();
    void refresh();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-medium text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={handleMarkAll}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {rows.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No notifications yet.
            </div>
          ) : (
            <ul>
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(r)}
                    className={`flex w-full items-start gap-2 border-b px-3 py-2 text-left text-sm hover:bg-accent ${
                      r.readAt ? "opacity-70" : ""
                    }`}
                  >
                    {!r.readAt && (
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.title}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.body}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(r.createdAt), {
                          addSuffix: true,
                        })}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
