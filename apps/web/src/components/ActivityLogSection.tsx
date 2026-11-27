// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ChevronDown,
  Database,
  Eye,
  EyeOff,
  Lock,
  FileEdit,
  FilePlus2,
  FolderSync,
  History,
  Loader2,
  Shield,
  Tag,
  Trash2,
  User,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { throwIfNotOk, withPrivacyUnlock } from "@/lib/privacyLock";
import { useToast } from "@/lib/toast";
import { qk } from "@/lib/queryKeys";
import { openDetails } from "@/lib/appEvents";
import { SettingsSection } from "./SettingsSection";

type ActivityEvent = {
  id: number;
  type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  mediaItemId: number | null;
  createdAt: string;
};

const TYPE_CONFIG: Record<
  string,
  { icon: typeof Archive; label: string; color: string }
> = {
  add: { icon: FilePlus2, label: "Added", color: "text-green-400" },
  watch: { icon: Eye, label: "Watched", color: "text-blue-400" },
  edit: { icon: FileEdit, label: "Edited", color: "text-amber-400" },
  tag: { icon: Tag, label: "Tags", color: "text-purple-400" },
  performer: { icon: User, label: "Performers", color: "text-pink-400" },
  hide: { icon: EyeOff, label: "Hidden", color: "text-zinc-400" },
  vault: { icon: Lock, label: "Vault", color: "text-rose-400" },
  scan: { icon: FolderSync, label: "Scans", color: "text-cyan-400" },
  backup: { icon: Archive, label: "Backups", color: "text-orange-400" },
  library: { icon: Database, label: "Library", color: "text-teal-400" },
  cache: { icon: Database, label: "Cache", color: "text-zinc-400" },
  privacy: { icon: Shield, label: "Privacy", color: "text-rose-400" },
  metadata: { icon: FileEdit, label: "Metadata", color: "text-amber-400" },
  collection: { icon: Database, label: "Collection", color: "text-indigo-400" },
};

const FILTER_TABS = [
  { key: undefined as string | undefined, label: "All", icon: History },
  { key: "add", label: "Added", icon: FilePlus2 },
  { key: "watch", label: "Watched", icon: Eye },
  { key: "edit", label: "Edited", icon: FileEdit },
  { key: "scan", label: "Scans", icon: FolderSync },
  { key: "backup", label: "Backups", icon: Archive },
];

/** Events drawn before "Show more"; the rest of the 200 fetched wait behind it. */
const PAGE = 25;

async function fetchActivity(type?: string): Promise<{ events: ActivityEvent[] }> {
  const params = new URLSearchParams();
  params.set("limit", "200");
  if (type) params.set("type", type);
  const response = await fetch(`/api/activity?${params}`);
  if (!response.ok) throw new Error(`Activity request failed: ${response.status}`);
  return response.json();
}

/** "Today", "Yesterday", then a short date — the year only when it isn't this one. */
function dayLabel(date: Date): string {
  const today = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function groupByDay(events: ActivityEvent[]): { day: string; events: ActivityEvent[] }[] {
  const groups: Map<string, ActivityEvent[]> = new Map();
  for (const event of events) {
    const key = dayLabel(new Date(event.createdAt));
    const list = groups.get(key);
    if (list) list.push(event);
    else groups.set(key, [event]);
  }
  return Array.from(groups, ([day, events]) => ({ day, events }));
}

function timeOnly(dateStr: string): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(dateStr));
}

/**
 * What happened in the library, as a timeline: one line down the side, an
 * event per stop, grouped under the day it happened. An event about a video
 * opens that video.
 */
export function ActivityLogSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeType, setActiveType] = useState<string | undefined>(undefined);
  const [shown, setShown] = useState(PAGE);
  // Clearing can't be undone, so it asks once, in place, before it goes.
  const [confirming, setConfirming] = useState(false);

  const { data, isError, isLoading } = useQuery({
    queryKey: qk.activity.byType(activeType),
    queryFn: () => fetchActivity(activeType),
  });

  const clear = useMutation({
    // Guarded server-side: wiping the log needs the privacy credential.
    mutationFn: () =>
      withPrivacyUnlock(async () => {
        const response = await fetch("/api/activity", { method: "DELETE" });
        await throwIfNotOk(response, "Failed to clear activity");
      }),
    onSuccess: () => {
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: qk.activity.all });
    },
    onError: (error) =>
      toast({
        title: "Could not clear the activity log",
        description: error.message,
        variant: "error",
      }),
  });

  const events = data?.events ?? [];
  const grouped = groupByDay(events.slice(0, shown));

  const action =
    events.length === 0 ? null : confirming ? (
      <span className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Clear all activity?</span>
        <button
          type="button"
          onClick={() => clear.mutate()}
          disabled={clear.isPending}
          className="flex items-center gap-1 rounded-md bg-destructive/90 px-2 py-1 font-medium text-white transition-colors hover:bg-destructive disabled:opacity-50"
        >
          {clear.isPending && <Loader2 className="size-3 animate-spin" />}
          Clear
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Cancel
        </button>
      </span>
    ) : (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" /> Clear log
      </button>
    );

  return (
    <SettingsSection
      title="Activity log"
      headingId="activity-title"
      description="Everything that happened in your library, newest first."
      action={action}
    >
      <div className="scrollbar-hide -mx-1 flex gap-1.5 overflow-x-auto px-1">
        {FILTER_TABS.map((tab) => {
          const on = activeType === tab.key;
          return (
            <button
              key={tab.key ?? "all"}
              type="button"
              onClick={() => {
                setActiveType(tab.key);
                setShown(PAGE);
              }}
              aria-pressed={on}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                on
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-3 pt-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="skeleton size-8 rounded-full" />
              <span className="skeleton h-4 flex-1 rounded" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Activity log is unavailable.
        </p>
      ) : grouped.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <History className="size-6 text-muted-foreground/60" />
          <p className="text-sm font-medium">Nothing here yet</p>
          <p className="text-xs text-muted-foreground">
            {activeType ? "No events of this kind." : "Scans, edits, watches and backups will show up as they happen."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ day, events: dayEvents }) => (
            <section key={day}>
              <h3 className="mb-3 flex items-baseline gap-2">
                <span className="text-sm font-semibold">{day}</span>
                <span className="text-xs text-muted-foreground">
                  {dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}
                </span>
              </h3>
              {/* The timeline: a faded accent line behind the stops. */}
              <ol className="relative space-y-1 before:absolute before:bottom-4 before:left-4 before:top-4 before:w-px before:bg-gradient-to-b before:from-primary/50 before:via-border before:to-transparent">
                {dayEvents.map((event) => {
                  const config = TYPE_CONFIG[event.type] ?? {
                    icon: Database,
                    label: event.type,
                    color: "text-muted-foreground",
                  };
                  const Icon = config.icon;
                  const body = (
                    <>
                      <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                        <Icon className={cn("size-3.5", config.color)} />
                      </span>
                      <span className="min-w-0 flex-1 py-1.5">
                        <span className="sensitive block text-sm leading-snug">{event.message}</span>
                        <span className="text-[11px] text-muted-foreground">{config.label}</span>
                      </span>
                      <time
                        className="shrink-0 py-1.5 text-xs tabular-nums text-muted-foreground"
                        dateTime={event.createdAt}
                      >
                        {timeOnly(event.createdAt)}
                      </time>
                    </>
                  );
                  return (
                    <li key={event.id}>
                      {event.mediaItemId !== null ? (
                        <button
                          type="button"
                          onClick={() => openDetails(event.mediaItemId!)}
                          className="group flex w-full items-start gap-3 rounded-lg pr-2 text-left transition-colors hover:bg-accent/50"
                        >
                          {body}
                        </button>
                      ) : (
                        <div className="flex items-start gap-3 pr-2">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}

          {events.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE * 2)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-accent/40 hover:text-foreground"
            >
              <ChevronDown className="size-4" />
              Show more · {events.length - shown} older
            </button>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
