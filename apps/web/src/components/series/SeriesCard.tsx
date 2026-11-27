// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Play } from "lucide-react";
import { PerformerAvatar } from "../PerformerAvatar";
import type { PerformerSummary } from "../PerformerCard";
import { StackedCover } from "./StackedCover";
import { seriesCoverUrl, type SeriesSummary } from "@/lib/seriesApi";
import { circleStyle, performerPortraitUrl } from "@/lib/performerApi";
import { openWatchPage } from "@/lib/appEvents";
import { qk } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

// A series as a card — its fanned cover, progress, name and facts — and the
// small reckonings about where you are in it. Shared by the series list and
// a performer's page.

export type Episode = NonNullable<SeriesSummary["episodes"]>[number];

/** How recently an episode must have arrived for the series to be "New". */
const NEW_FOR_MS = 14 * 24 * 60 * 60 * 1000;
const RESUME_MARGIN = 10;

export function progressOf(episode: Episode): number {
  if (episode.completed) return 1;
  if (!episode.duration || !episode.position) return 0;
  return Math.min(1, episode.position / episode.duration);
}
export function resumable(episode: Episode): boolean {
  return (
    !episode.completed &&
    episode.position > RESUME_MARGIN &&
    (episode.duration == null || episode.position < episode.duration - RESUME_MARGIN)
  );
}

/** The episode to play next: one partway through, else the first unfinished. */
export function nextOf(entry: SeriesSummary): { episode: Episode; number: number; resume: boolean } | null {
  const episodes = entry.episodes ?? [];
  let index = episodes.findIndex(resumable);
  if (index < 0) index = episodes.findIndex((episode) => !episode.completed);
  if (index < 0) return null;
  return { episode: episodes[index], number: index + 1, resume: resumable(episodes[index]) };
}

export function started(entry: SeriesSummary): boolean {
  return (entry.episodes ?? []).some((episode) => episode.completed || episode.position > RESUME_MARGIN);
}
export function finished(entry: SeriesSummary): boolean {
  return entry.episodeCount > 0 && entry.unwatched === 0;
}
export function isNew(entry: SeriesSummary): boolean {
  return !!entry.newestAddedAt && Date.now() - new Date(entry.newestAddedAt).getTime() < NEW_FOR_MS;
}
export function years(entry: SeriesSummary): string | null {
  const first = entry.firstReleased?.slice(0, 4);
  const last = entry.lastReleased?.slice(0, 4);
  if (!first) return null;
  return last && last !== first ? `${first}–${last}` : first;
}

/** One segment per episode, filled as far as it has been watched. */
export function ProgressSegments({ episodes, className }: { episodes: Episode[]; className?: string }) {
  if (episodes.length === 0) return null;
  return (
    <div className={cn("flex h-1 gap-[3px]", className)}>
      {episodes.map((episode) => (
        <span key={episode.id} className="h-full flex-1 overflow-hidden rounded-full bg-white/15">
          <span className="block h-full bg-primary" style={{ width: `${progressOf(episode) * 100}%` }} />
        </span>
      ))}
    </div>
  );
}

/** Portraits by id, from the list every performer picture reads. */
export function usePerformerPortraits() {
  const { data } = useQuery({
    queryKey: qk.performers.all,
    queryFn: async () => {
      const res = await fetch("/api/performers");
      if (!res.ok) throw new Error(`Failed to load performers: ${res.status}`);
      return (await res.json()) as { performers: PerformerSummary[] };
    },
  });
  return useMemo(() => new Map((data?.performers ?? []).map((p) => [p.id, p])), [data]);
}

/** A series in the grid: its fanned cover, progress, name and facts. */
export function SeriesCard({
  entry,
  portraits,
  large,
}: {
  entry: SeriesSummary;
  portraits: Map<number, PerformerSummary>;
  large: boolean;
}) {
  const next = nextOf(entry);
  const lead = entry.lead;
  const summary = lead ? portraits.get(lead.id) : undefined;
  const cover = (entry.coverItemIds?.length
    ? entry.coverItemIds
    : entry.representativeItemId != null
      ? [entry.representativeItemId]
      : []
  ).map((id) => ({ id }));
  const facts = [entry.studios?.join(", "), years(entry)].filter(Boolean).join(" · ");

  const inset = large ? "mx-[10%]" : "mx-[12%]";
  return (
    <div className="group space-y-4 rounded-2xl p-3 transition-colors hover:bg-white/[0.03]">
      {/* The cover, with a play button over its middle on hover. The button
          sits beside the link, not in it: a button can't be inside a link. */}
      <div className={cn("relative mt-3", inset)}>
        <Link to="/series/$seriesId" params={{ seriesId: String(entry.id) }} aria-label={entry.name} className="block">
          <StackedCover items={cover} poster={entry.coverFile ? seriesCoverUrl(entry.id, entry.coverFile) : null} />
        </Link>
        {/* At a glance: new episodes, or all watched. */}
        {(isNew(entry) || finished(entry)) && (
          <span
            className={cn(
              "pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              finished(entry) ? "bg-emerald-500 text-black" : "bg-primary text-primary-foreground",
            )}
          >
            {finished(entry) ? (
              <>
                <Check className="size-3" strokeWidth={3} /> Finished
              </>
            ) : (
              "New"
            )}
          </span>
        )}
        {next && (
          <button
            type="button"
            onClick={() => openWatchPage(next.episode.id, { resume: next.resume })}
            aria-label={`${next.resume ? "Continue" : "Play"} episode ${next.number} of ${entry.name}`}
            title={`${next.resume ? "Continue" : "Play"} Ep ${next.number}`}
            className="absolute left-1/2 top-1/2 z-20 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black opacity-0 shadow-xl transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Play className="size-5 translate-x-px fill-current" />
          </button>
        )}
      </div>

      <Link to="/series/$seriesId" params={{ seriesId: String(entry.id) }} className="block space-y-4">
        <ProgressSegments episodes={entry.episodes ?? []} className={inset} />
        <div className="space-y-1.5 text-center">
          <h2 className={cn("sensitive truncate font-semibold text-zinc-100 group-hover:text-white", large ? "text-lg" : "text-base")}>
            {entry.name}
          </h2>
          <p className="truncate text-xs text-zinc-500">
            {entry.episodeCount} {entry.episodeCount === 1 ? "episode" : "episodes"}
            {facts && ` · ${facts}`}
          </p>
          {lead && (
            <span className="sensitive inline-flex max-w-full items-center gap-1.5 text-xs text-zinc-400">
              <PerformerAvatar
                name={lead.name}
                src={summary ? performerPortraitUrl(summary) : null}
                framing={summary ? circleStyle(summary) : undefined}
                className="size-5"
                fallbackClassName="text-[9px]"
              />
              <span className="truncate">{lead.name}</span>
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}

