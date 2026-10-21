import { pkey } from "@/lib/profileStorage";
import {
  Bell,
  CheckCircle2,
  Copy,
  FileWarning,
  ScanLine,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useLibraryStats } from "@/lib/statsApi";

const DISMISSED_KEY = "dismissed-notifications";

function readDismissed(): Set<string> {
  try {
    const value = JSON.parse(
      localStorage.getItem(pkey(DISMISSED_KEY)) ?? "[]",
    ) as unknown;
    return new Set(
      Array.isArray(value)
        ? value.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>): void {
  try {
    localStorage.setItem(pkey(DISMISSED_KEY), JSON.stringify([...ids]));
  } catch {
    // Dismissal is optional when browser storage is unavailable.
  }
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed);
  const { data } = useLibraryStats();

  const notifications = data
    ? [
        ...(data.lastScan?.status === "failed"
          ? [
              {
                id: `scan:${data.lastScan.startedAt}`,
                label: "Library scan failed",
                icon: ScanLine,
                href: "/settings" as const,
              },
            ]
          : []),
        ...(data.videoMissing > 0
          ? [
              {
                id: `missing:${data.videoMissing}`,
                label: `${data.videoMissing} missing video${data.videoMissing === 1 ? "" : "s"}`,
                icon: FileWarning,
                href: "/settings" as const,
              },
            ]
          : []),
        ...(data.videoDuplicateGroups > 0
          ? [
              {
                id: `duplicates:${data.videoDuplicateGroups}`,
                label: `${data.videoDuplicateGroups} duplicate group${data.videoDuplicateGroups === 1 ? "" : "s"} found`,
                icon: Copy,
                href: "/settings" as const,
              },
            ]
          : []),
        ...(!data.lastBackup
          ? [
              {
                id: "backup:none",
                label: "No backup has been created",
                icon: Bell,
                href: "/settings" as const,
              },
            ]
          : []),
      ]
    : [];
  const visibleNotifications = notifications.filter(
    (notification) => !dismissed.has(notification.id),
  );
  const count = visibleNotifications.length;

  function clearNotifications() {
    const next = new Set(dismissed);
    notifications.forEach((notification) => next.add(notification.id));
    setDismissed(next);
    writeDismissed(next);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={count ? `${count} notifications` : "Notifications"}
        aria-expanded={open}
        title="Notifications"
        className="relative flex size-9 items-center justify-center rounded-full bg-secondary text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground"
      >
        {open ? <X className="size-4" /> : <Bell className="size-4" />}
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-black">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {count} open
              </span>
              {visibleNotifications.length > 0 && (
                <button
                  type="button"
                  onClick={clearNotifications}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="size-3" /> Clear
                </button>
              )}
            </div>
          </div>
          {visibleNotifications.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-500" /> Library
              healthy
            </div>
          ) : (
            <div className="p-2">
              {visibleNotifications.map((notification) => {
                const Icon = notification.icon;
                return (
                  <Link
                    key={notification.id}
                    to={notification.href}
                    search={{ tab: "library" }}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-accent"
                  >
                    <Icon className="size-4 shrink-0 text-amber-500" />
                    <span className="min-w-0 flex-1">{notification.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
