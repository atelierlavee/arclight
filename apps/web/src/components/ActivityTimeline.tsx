// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { Eye, Heart, History, Pencil, Play } from "lucide-react";
import { localDay } from "@/lib/insights";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { readActivity, recentChangedEvent, type ActivityEntry, type RecentKind } from "@/lib/recent";

const KIND: Record<RecentKind, { label: string; icon: typeof Eye }> = {
  browsed: { label: "Opened", icon: Eye },
  played: { label: "Played", icon: Play },
  edited: { label: "Edited", icon: Pencil },
  favourited: { label: "Favourited", icon: Heart },
};

function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * What you opened, played, edited and favourited, day by day — the history
 * the home page's "Recently browsed" and "Recently interacted" rows used to
 * show in pieces. Kept in this browser only, like those rows were.
 */
export function ActivityTimeline({ onOpen }: { onOpen: (id: number) => void }) {
  const [entries, setEntries] = useState<ActivityEntry[]>(readActivity);

  useEffect(() => {
    const refresh = () => setEntries(readActivity());
    window.addEventListener(recentChangedEvent(), refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(recentChangedEvent(), refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
        <History className="size-8 text-muted-foreground/50" />
        Nothing yet. What you open, play, edit and favourite shows up here.
      </div>
    );
  }

  const days: { day: string; entries: ActivityEntry[] }[] = [];
  for (const entry of entries) {
    const day = localDay(new Date(entry.at));
    const last = days.at(-1);
    if (last?.day === day) last.entries.push(entry);
    else days.push({ day, entries: [entry] });
  }

  return (
    <div className="space-y-8">
      {days.map(({ day, entries: dayEntries }) => (
        <section key={day} className="space-y-2">
          <header className="border-b border-border pb-1.5">
            <h2 className="text-sm font-semibold">{dayLabel(day)}</h2>
          </header>
          <ul className="space-y-1">
            {dayEntries.map((entry) => {
              const { label, icon: Icon } = KIND[entry.kind];
              return (
                <li key={`${entry.kind}:${entry.id}:${entry.at}`}>
                  <button
                    type="button"
                    onClick={() => onOpen(entry.id)}
                    className="flex w-full items-center gap-3 rounded-md p-1.5 text-left transition-colors hover:bg-accent"
                  >
                    <img
                      src={thumbnailUrl({ id: entry.id, thumbnailFile: entry.thumbnailFile ?? null })}
                      alt=""
                      loading="lazy"
                      className="sensitive aspect-video w-28 shrink-0 rounded object-cover"
                    />
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="sensitive block truncate text-sm font-medium">{entry.title}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Icon className="size-3" />
                        {label}
                        <span aria-hidden>·</span>
                        <span className="tabular-nums">
                          {new Date(entry.at).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
