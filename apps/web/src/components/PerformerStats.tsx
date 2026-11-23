// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { Building2, CalendarRange, Clock, Eye, Film } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PerformerDetail } from "@/lib/performerApi";
import { cn } from "@/lib/utils";

function formatDuration(seconds: number): string | null {
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

type Stat = {
  icon: LucideIcon;
  value: string;
  label: string;
  /** The one figure here you can act on, rather than just read. */
  accent?: boolean;
};

/**
 * The shape of a performer's collection, as a strip under the banner.
 *
 * It began as one line of muted grey under the name, the same size and colour
 * as the bio below it, so it read as a caption and the figures were easy to
 * miss. Making it louder in place did not work — anything loud enough to
 * notice was competing with a 4xl name and a portrait for the same corner.
 * Room was the fix rather than weight, so it moved out here.
 *
 * The icon is what makes a figure findable without reading: you look for the
 * clock rather than parsing five numbers to see which one is a duration. It
 * sits in a tinted tile so the row has some structure to it and does not read
 * as a bare table.
 *
 * Every figure is derived from the same set the grid below renders, so the
 * numbers and the page can't disagree. Each is omitted when it would be noise
 * — no year range for a performer with no dated videos, no "unwatched" when
 * you have seen everything — rather than printing a row of zeroes.
 */
export function PerformerStats({ performer }: { performer: PerformerDetail }) {
  const duration = formatDuration(performer.totalDurationSeconds);

  // Only real studios; the null bucket is "no studio", not a studio.
  const studioCount = performer.studios.filter((s) => s.name !== null).length;
  const years = performer.years
    .map((y) => y.year)
    .filter((y): y is number => y !== null);
  const [from, to] = [Math.min(...years), Math.max(...years)];

  const stats: Stat[] = [
    {
      icon: Film,
      value: String(performer.videoCount),
      label: performer.videoCount === 1 ? "video" : "videos",
    },
  ];
  if (duration) {
    stats.push({ icon: Clock, value: duration, label: "total" });
  }
  if (studioCount > 0) {
    stats.push({
      icon: Building2,
      value: String(studioCount),
      label: studioCount === 1 ? "studio" : "studios",
    });
  }
  if (years.length > 0) {
    stats.push({
      icon: CalendarRange,
      value: from === to ? `${from}` : `${from}–${to}`,
      label: from === to ? "year" : "years",
    });
  }
  if (performer.watch.unwatched > 0) {
    stats.push({
      icon: Eye,
      value: String(performer.watch.unwatched),
      label: "unwatched",
      accent: true,
    });
  }

  return (
    <dl className="flex flex-wrap items-stretch border-y border-border/60 bg-gradient-to-b from-card/40 to-transparent px-4 md:px-6">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className={cn(
            "group flex items-center gap-3 py-3",
            index > 0 && "ml-7 border-l border-border/50 pl-7",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors",
              stat.accent
                ? "bg-amber-500/10 text-amber-500 ring-amber-500/20"
                : "bg-secondary/60 text-muted-foreground ring-border/50 group-hover:text-foreground",
            )}
          >
            <stat.icon className="size-4" />
          </span>

          {/* Reversed so the figure reads before its unit — "25 videos" —
              while the markup keeps the term-then-description order a
              definition list is meant to have. The block is content-width, so
              there is no free space for the reversal to push around.

              Sentence case rather than the small caps this used when it was
              stacked: uppercase earns its keep as a column heading under a
              number, and reads as shouting in the middle of a phrase. */}
          <div className="flex flex-row-reverse items-baseline gap-1.5">
            <dt className="text-sm text-muted-foreground">{stat.label}</dt>
            <dd
              className={cn(
                "text-lg font-semibold tabular-nums",
                stat.accent ? "text-amber-500" : "text-foreground",
              )}
            >
              {stat.value}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
