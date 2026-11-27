// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Bookmark,
  Database,
  Droplets,
  Eye,
  EyeOff,
  FileEdit,
  FilePlus2,
  FolderHeart,
  FolderSync,
  Heart,
  Inbox,
  KeyRound,
  Library,
  Loader2,
  Lock,
  Settings,
  Shield,
  StickyNote,
  Tag,
  Trash2,
  Trophy,
  User,
  UserCircle,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { throwIfNotOk, withPrivacyUnlock } from "@/lib/privacyLock";
import { useToast } from "@/lib/toast";
import { qk } from "@/lib/queryKeys";
import { openDetails } from "@/lib/appEvents";
import { thumbnailUrl } from "@/lib/mediaItemApi";

type ActivityEvent = {
  id: number;
  type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  mediaItemId: number | null;
  /** The item's thumbnail version, when the event is about one. */
  thumbnailFile?: string | null;
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
  metadata: { icon: Library, label: "Organised", color: "text-amber-400" },
  collection: { icon: FolderHeart, label: "Collection", color: "text-indigo-400" },
  o: { icon: Droplets, label: "O", color: "text-sky-400" },
  bookmark: { icon: Bookmark, label: "Bookmark", color: "text-blue-400" },
  note: { icon: StickyNote, label: "Note", color: "text-yellow-400" },
  inbox: { icon: Inbox, label: "Inbox", color: "text-emerald-400" },
  follow: { icon: Heart, label: "Following", color: "text-pink-400" },
  account: { icon: KeyRound, label: "Account", color: "text-rose-400" },
  profile: { icon: UserCircle, label: "Profile", color: "text-violet-400" },
  settings: { icon: Settings, label: "Settings", color: "text-zinc-400" },
  achievement: { icon: Trophy, label: "Achievement", color: "text-amber-300" },
};

/** The filters are groups of event types, sent comma-separated. */
const FILTER_TABS = [
  { key: undefined as string | undefined, label: "All" },
  { key: "watch,o,bookmark,note", label: "Watching" },
  { key: "add", label: "Added" },
  { key: "edit,tag,performer,hide,metadata,collection,inbox,follow", label: "Edits" },
  { key: "scan,library,cache,backup", label: "Library" },
  { key: "account,privacy,vault,profile", label: "Security" },
  { key: "settings,achievement", label: "Settings" },
];

/** Events drawn before "Show more"; the rest of the 200 fetched wait behind it. */
const PAGE = 25;

async function fetchActivity(
  type?: string,
): Promise<{ events: ActivityEvent[] }> {
  const params = new URLSearchParams();
  params.set("limit", "200");
  if (type) params.set("type", type);
  const response = await fetch(`/api/activity?${params}`);
  if (!response.ok)
    throw new Error(`Activity request failed: ${response.status}`);
  return response.json();
}

/** "Today", "Yesterday", then a short date — the year only when it isn't this one. */
function dayLabel(date: Date): string {
  const today = new Date();
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
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

function groupByDay(
  events: ActivityEvent[],
): { day: string; events: ActivityEvent[] }[] {
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
  return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(
    new Date(dateStr),
  );
}

/**
 * The server writes events as sentences — `Edited "Title": studio → "X"`,
 * `Tags on "Title" set to …`. For an item, the quoted title becomes the
 * headline and what follows it the detail; the kind label already says the
 * verb. Anything that doesn't fit that shape stays one line, whole.
 */
function splitMessage(message: string): { title: string; detail: string } {
  const match = /^[^"]*"(.+?)"(?=:|\s|$)(.*)$/s.exec(message);
  if (!match) return { title: message, detail: "" };
  return { title: match[1], detail: match[2].replace(/^\s*:?\s*/, "") };
}

function kindOf(type: string) {
  return (
    TYPE_CONFIG[type] ?? {
      icon: Database,
      label: type,
      color: "text-muted-foreground",
    }
  );
}

/** An event about a video or photo: its picture, its title, what changed. */
function ItemEvent({ event }: { event: ActivityEvent }) {
  const kind = kindOf(event.type);
  const { title, detail } = splitMessage(event.message);
  return (
    <button
      type="button"
      onClick={() => openDetails(event.mediaItemId!)}
      title={event.message}
      className="group flex w-full items-start gap-4 py-4 text-left md:gap-6"
    >
      <span className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-muted md:w-44">
        <img
          src={thumbnailUrl(
            { id: event.mediaItemId!, thumbnailFile: event.thumbnailFile },
            "small",
          )}
          alt=""
          loading="lazy"
          decoding="async"
          // An item with no picture yet keeps the quiet placeholder.
          onError={(e) => (e.currentTarget.style.visibility = "hidden")}
          className="size-full object-cover transition-[scale] duration-500 ease-out group-hover:scale-105"
        />
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span
          className={cn(
            "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]",
            kind.color,
          )}
        >
          <kind.icon className="size-3" />
          {kind.label}
        </span>
        <span className="sensitive mt-1 block truncate text-base font-semibold leading-snug transition-colors group-hover:text-primary md:text-lg">
          {title}
        </span>
        {detail && (
          <span className="sensitive mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {detail}
          </span>
        )}
      </span>
      <time
        className="shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground"
        dateTime={event.createdAt}
      >
        {timeOnly(event.createdAt)}
      </time>
    </button>
  );
}

/** An event about the library itself — a scan, a backup: one quiet line. */
function SystemEvent({ event }: { event: ActivityEvent }) {
  const kind = kindOf(event.type);
  return (
    <div className="flex items-center gap-4 py-3 md:gap-6">
      <span className="flex w-32 shrink-0 justify-end md:w-44">
        <kind.icon className={cn("size-4", kind.color)} />
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="sensitive">{event.message}</span>
        <span className="ml-2 text-xs text-muted-foreground">{kind.label}</span>
      </span>
      <time
        className="shrink-0 text-xs tabular-nums text-muted-foreground"
        dateTime={event.createdAt}
      >
        {timeOnly(event.createdAt)}
      </time>
    </div>
  );
}

/**
 * What happened in the library, day by day: the day large on the left, held
 * in view while its events scroll past, and each event as an open row — the
 * picture and title for anything about an item, a single line for the rest.
 * An event about an item opens it. The Activity page's body.
 */
export function ActivityLog() {
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
      <span className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">Clear everything?</span>
        <button
          type="button"
          onClick={() => clear.mutate()}
          disabled={clear.isPending}
          className="flex items-center gap-1.5 font-medium text-destructive transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {clear.isPending && <Loader2 className="size-3.5 animate-spin" />}
          Clear
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </span>
    ) : (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-destructive"
      >
        <Trash2 className="size-3.5" /> Clear log
      </button>
    );

  return (
    <div>
      {/* Plain words for the filters, like the top bar's links: the chosen
          one bright with a short accent rule under it. */}
      <div className="flex items-center gap-6 border-b border-border/50">
        <nav
          aria-label="Filter activity"
          className="scrollbar-hide -mb-px flex min-w-0 flex-1 gap-6 overflow-x-auto"
        >
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
                  "relative shrink-0 whitespace-nowrap py-3 text-sm font-medium transition-colors",
                  "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:transition-opacity",
                  on
                    ? "text-foreground after:opacity-100"
                    : "text-muted-foreground after:opacity-0 hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {isLoading ? (
        <div className="mt-8 space-y-6">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="flex items-start gap-4 md:gap-6 lg:pl-[13rem]"
            >
              <span className="skeleton aspect-video w-32 shrink-0 rounded-lg md:w-44" />
              <span className="flex-1 space-y-2 pt-1">
                <span className="skeleton block h-3 w-16 rounded" />
                <span className="skeleton block h-5 w-2/3 rounded" />
                <span className="skeleton block h-4 w-1/2 rounded" />
              </span>
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="mt-10 text-sm text-destructive">
          The activity log is unavailable.
        </p>
      ) : grouped.length === 0 ? (
        <div className="py-24">
          <p className="text-3xl font-semibold tracking-tight md:text-4xl">
            Nothing here yet.
          </p>
          <p className="mt-3 max-w-md text-muted-foreground">
            {activeType
              ? "No events of this kind."
              : "Scans, edits, watches and backups show up here as they happen."}
          </p>
        </div>
      ) : (
        <>
          {grouped.map(({ day, events: dayEvents }) => (
            <section
              key={day}
              className="grid gap-x-10 border-b border-border/40 py-8 last:border-b-0 lg:grid-cols-[11rem_minmax(0,1fr)]"
            >
              {/* Held in view below the slim top bar while its events scroll. */}
              <header className="mb-2 self-start lg:sticky lg:top-24 lg:mb-0 lg:pt-4">
                <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                  {day}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dayEvents.length}{" "}
                  {dayEvents.length === 1 ? "event" : "events"}
                </p>
              </header>
              <ol className="divide-y divide-border/40">
                {dayEvents.map((event) => (
                  <li key={event.id}>
                    {event.mediaItemId !== null ? (
                      <ItemEvent event={event} />
                    ) : (
                      <SystemEvent event={event} />
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}

          {events.length > shown && (
            <div className="pt-6 lg:pl-[13.5rem]">
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE * 2)}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Show {Math.min(PAGE * 2, events.length - shown)} more ·{" "}
                {events.length - shown} older
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
