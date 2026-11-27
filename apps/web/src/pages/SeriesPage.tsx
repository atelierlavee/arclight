// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Film, ImagePlus, Play } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PerformerAvatar } from "@/components/PerformerAvatar";
import type { PerformerSummary } from "@/components/PerformerCard";
import { SilkWaves } from "@/components/home/LibraryScenes";
import {
  fetchRelatedSeries,
  fetchSeriesDetail,
  removeSeriesCover,
  seriesCoverUrl,
  uploadSeriesCover,
  type SeriesDetail,
  type SeriesEpisode,
} from "@/lib/seriesApi";
import { useIsOwner } from "@/lib/profile";
import { useToast } from "@/lib/toast";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { circleStyle, performerPortraitUrl } from "@/lib/performerApi";
import { qk } from "@/lib/queryKeys";
import { openWatchPage } from "@/lib/appEvents";
import { endLeanBack } from "@/lib/leanBack";
import { useQueue } from "@/lib/queue";
import { formatTimestamp } from "@/lib/bookmarkApi";
import { cn, formatDuration } from "@/lib/utils";

const routeApi = getRouteApi("/series/$seriesId");

/** Under this many seconds in, or this close to the end, there is nothing to resume. */
const RESUME_MARGIN = 10;

function progressOf(episode: SeriesEpisode): number {
  if (episode.completedAt) return 1;
  if (!episode.durationSeconds || !episode.lastPositionSeconds) return 0;
  return Math.min(1, episode.lastPositionSeconds / episode.durationSeconds);
}

function canResume(episode: SeriesEpisode): boolean {
  const at = episode.lastPositionSeconds ?? 0;
  return (
    !episode.completedAt &&
    at > RESUME_MARGIN &&
    (episode.durationSeconds == null || at < episode.durationSeconds - RESUME_MARGIN)
  );
}

/** "Ep 3", or "S2 · Ep 3" when the series has more than one season. */
function partLabel(episode: SeriesEpisode, seasons: number): string {
  const ep = `Ep ${episode.episodeNumber ?? "?"}`;
  return seasons > 1 ? `S${episode.seasonNumber ?? 1} · ${ep}` : ep;
}

/** "3 days ago", "2 months ago" — how long since a moment, roughly. */
function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const steps: [number, string][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [2592000, "month"],
    [31536000, "year"],
  ];
  if (seconds < 60) return "just now";
  let unit = "minute";
  let size = 60;
  for (const [length, name] of steps) {
    if (seconds >= length) {
      unit = name;
      size = length;
    }
  }
  const amount = Math.floor(seconds / size);
  return `${amount} ${unit}${amount === 1 ? "" : "s"} ago`;
}

/** Who is in it: overlapping portraits, then the names. */
function CastLine({ cast }: { cast: NonNullable<SeriesDetail["performers"]> }) {
  // The same list every performer picture reads, so usually from the cache.
  const { data } = useQuery({
    queryKey: qk.performers.all,
    queryFn: async () => {
      const res = await fetch("/api/performers");
      if (!res.ok) throw new Error(`Failed to load performers: ${res.status}`);
      return (await res.json()) as { performers: PerformerSummary[] };
    },
  });
  if (cast.length === 0) return null;
  const byId = new Map((data?.performers ?? []).map((p) => [p.id, p]));
  const shown = cast.slice(0, 5);
  const lead = cast[0];
  const others = cast.length - 1;
  return (
    <div className="flex items-center gap-3">
      <div className="flex">
        {shown.map((performer, index) => {
          const summary = byId.get(performer.id);
          return (
            <Link
              key={performer.id}
              to="/performer/$performerId"
              params={{ performerId: String(performer.id) }}
              title={performer.name}
              className={cn("relative rounded-full ring-2 ring-background transition-transform hover:z-10 hover:-translate-y-0.5", index > 0 && "-ml-2.5")}
            >
              <PerformerAvatar
                name={performer.name}
                src={summary ? performerPortraitUrl(summary) : null}
                framing={summary ? circleStyle(summary) : undefined}
                className="size-9"
                fallbackClassName="text-xs"
              />
            </Link>
          );
        })}
      </div>
      <p className="sensitive text-sm text-zinc-300">
        with{" "}
        <Link to="/performer/$performerId" params={{ performerId: String(lead.id) }} className="font-semibold text-white hover:underline">
          {lead.name}
        </Link>
        {others > 0 && ` and ${others} ${others === 1 ? "other" : "others"}`}
      </p>
    </div>
  );
}

/**
 * Who is in one episode: small portraits and their names. Not links — the
 * whole row plays the episode, and a link can't sit inside that button.
 */
function EpisodeCast({ cast }: { cast: { id: number; name: string }[] }) {
  // The same list every performer picture reads, so usually from the cache.
  const { data } = useQuery({
    queryKey: qk.performers.all,
    queryFn: async () => {
      const res = await fetch("/api/performers");
      if (!res.ok) throw new Error(`Failed to load performers: ${res.status}`);
      return (await res.json()) as { performers: PerformerSummary[] };
    },
  });
  if (cast.length === 0) return null;
  const byId = new Map((data?.performers ?? []).map((p) => [p.id, p]));
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="flex shrink-0">
        {cast.slice(0, 4).map((performer, index) => {
          const summary = byId.get(performer.id);
          return (
            <PerformerAvatar
              key={performer.id}
              name={performer.name}
              src={summary ? performerPortraitUrl(summary) : null}
              framing={summary ? circleStyle(summary) : undefined}
              className={cn("size-6 ring-2 ring-background", index > 0 && "-ml-2")}
              fallbackClassName="text-[10px]"
            />
          );
        })}
      </span>
      <span className="sensitive truncate text-[13px] text-zinc-300">
        {cast.map((performer) => performer.name).join(", ")}
      </span>
    </span>
  );
}

/** Other series sharing this one's performers or studio. */
function RelatedSeriesRow({ seriesId }: { seriesId: number }) {
  const { data } = useQuery({
    queryKey: qk.series.related(seriesId),
    queryFn: () => fetchRelatedSeries(seriesId),
  });
  const related = data?.series ?? [];
  if (related.length === 0) return null;
  return (
    <section className="space-y-5">
      <h2 className="text-xl font-bold tracking-[-0.01em]">More series like this</h2>
      <div className="scrollbar-hide -mx-1 flex snap-x gap-5 overflow-x-auto px-1 pb-1">
        {related.map((entry) => (
          <Link
            key={entry.id}
            to="/series/$seriesId"
            params={{ seriesId: String(entry.id) }}
            className="group w-64 shrink-0 snap-start space-y-2.5"
          >
            <span className="block aspect-video overflow-hidden rounded-xl bg-secondary">
              {entry.representativeItemId != null ? (
                <img
                  src={thumbnailUrl({ id: entry.representativeItemId })}
                  alt=""
                  loading="lazy"
                  className="sensitive size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              ) : (
                <span className="flex size-full items-center justify-center">
                  <Film className="size-5 text-muted-foreground" />
                </span>
              )}
            </span>
            <span className="sensitive block truncate text-[15px] font-semibold text-zinc-100 group-hover:text-white">
              {entry.name}
            </span>
            <span className="-mt-1 block text-xs text-zinc-500">
              {entry.episodeCount} {entry.episodeCount === 1 ? "episode" : "episodes"} ·{" "}
              {entry.sharedPerformers > 0
                ? `${entry.sharedPerformers} shared ${entry.sharedPerformers === 1 ? "performer" : "performers"}`
                : "Same studio"}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * A series: its parts in order, where you are in them, and the one to watch
 * next. A quiet header — a fanned cover, the name, the cast and a play
 * button — then the parts as large numbered rows with your progress, and
 * other series like it.
 */
/**
 * The series' poster, beside the title. The owner sets, changes or removes
 * it here; it is drawn on top of the stacked cover on the series list.
 */
function SeriesPoster({ id, coverFile }: { id: number; coverFile: string | null }) {
  const isOwner = useIsOwner();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!coverFile && !isOwner) return null;

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: qk.series.all });
      toast({ title: done, variant: "success" });
    } catch (error) {
      toast({ title: "Couldn't update the cover", description: (error as Error).message, variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const picker = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void run(() => uploadSeriesCover(id, file), "Cover set");
      }}
    />
  );

  if (!coverFile) {
    return (
      <div className="w-full max-w-[10rem] shrink-0 self-center">
        {picker}
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="group/add flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-2xl text-zinc-500 transition-colors hover:text-white disabled:opacity-50"
        >
          <ImagePlus className="size-7 transition-transform group-hover/add:-translate-y-0.5" />
          <span className="text-sm font-medium">{busy ? "Uploading…" : "Add a cover poster"}</span>
          <span className="text-xs text-zinc-600">Sits on top of the stack in Stories</span>
        </button>
      </div>
    );
  }

  return (
    // Shrink-wrapped to the image, whatever its shape: never cropped.
    <div className="group/poster relative w-fit max-w-[10rem] shrink-0 self-center">
      {picker}
      <img
        src={seriesCoverUrl(id, coverFile)}
        alt=""
        className={cn(
          "sensitive block max-h-[150px] max-w-full rounded-2xl shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/15 transition-opacity",
          busy && "opacity-50",
        )}
      />
      {isOwner && (
        <div className="absolute inset-0 flex flex-col items-center justify-end gap-1.5 rounded-2xl bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/poster:opacity-100">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="w-full rounded-full bg-white px-3 py-1 text-xs font-semibold text-black transition-transform hover:scale-105 disabled:opacity-50"
          >
            Change
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => removeSeriesCover(id), "Cover removed")}
            className="w-full rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-white/25 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

export function SeriesPage() {
  const { seriesId } = routeApi.useParams();
  const id = Number(seriesId);
  const [season, setSeason] = useState<number | null>(null);
  const { clear, add } = useQueue();
  const { data, isError, isLoading } = useQuery({
    queryKey: qk.series.detail(id),
    queryFn: () => fetchSeriesDetail(id),
  });

  if (isError) {
    return (
      <AppShell title="Series not found">
        <p className="px-4 text-sm text-muted-foreground md:px-6">That series could not be found.</p>
      </AppShell>
    );
  }
  if (isLoading || !data) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-[1276px] space-y-4 px-4 pt-[84px] md:px-12">
          <div className="skeleton h-12 w-64 rounded-lg" />
          <div className="skeleton h-40 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  const seasonCount = data.seasons.length;
  const activeSeason = season ?? data.seasons[0]?.number ?? 1;
  const shown = data.seasons.find((entry) => entry.number === activeSeason)?.episodes ?? [];
  const all = data.seasons.flatMap((entry) => entry.episodes);
  const watched = all.filter((episode) => episode.completedAt).length;
  const totalSeconds = all.reduce((sum, episode) => sum + (episode.durationSeconds ?? 0), 0);
  // The part to watch next: one you are partway through, else the first
  // not yet finished. All finished, it is the first again.
  const next = all.find(canResume) ?? all.find((episode) => !episode.completedAt) ?? null;

  // Your progress through the whole series.
  const watchedSeconds = all.reduce(
    (sum, episode) =>
      sum + (episode.completedAt ? episode.durationSeconds ?? 0 : Math.min(episode.lastPositionSeconds ?? 0, episode.durationSeconds ?? Infinity)),
    0,
  );
  const lastPlayed = all
    .map((episode) => episode.lastPlayedAt)
    .filter((when): when is string => Boolean(when))
    .sort()
    .pop();

  const years = (() => {
    const first = data.firstReleased?.slice(0, 4);
    const last = data.lastReleased?.slice(0, 4);
    if (!first) return null;
    return last && last !== first ? `${first}–${last}` : first;
  })();

  /** Plays from one part and queues every part after it, in order. */
  function playFrom(start: SeriesEpisode, resume: boolean) {
    const index = all.findIndex((episode) => episode.id === start.id);
    endLeanBack();
    clear();
    for (const episode of all.slice(index + 1)) {
      add({
        id: episode.id,
        title: episode.episodeTitle || episode.title,
        thumbnailFile: episode.thumbnailFile,
        durationSeconds: episode.durationSeconds,
      });
    }
    openWatchPage(start.id, { resume });
  }

  return (
    <AppShell>
      <div className="relative isolate">
        {/* The home page's silk, faint, drifting behind the header. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-24 -z-10 h-[420px] overflow-hidden">
          <SilkWaves className="absolute right-0 top-1/2 h-[70%] w-[45%] -translate-y-1/2 opacity-30" />
        </div>

        {/* The header. */}
        <section className="mx-auto w-full max-w-[1276px] space-y-8 px-4 pb-8 pt-[84px] md:px-12">
          <Link
            to="/series"
            className="flex w-fit items-center gap-1.5 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-4" />
            All stories
          </Link>

          {/* The poster on the left, the title and facts beside it. */}
          <div className="flex flex-wrap items-center gap-x-12 gap-y-10">
            <SeriesPoster id={data.id} coverFile={data.coverFile ?? null} />
            <div className="flex min-w-0 flex-[1_1_32rem] flex-col gap-8">
              <div className="min-w-0 flex-1 space-y-4">
                <div className="space-y-2">
                  <h1 className="sensitive text-4xl font-black leading-[1.02] tracking-tight text-white text-balance md:text-5xl">
                    {data.name}
                  </h1>
                  <p className="sensitive text-sm font-medium text-zinc-400">
                    {[
                      `${all.length} ${all.length === 1 ? "episode" : "episodes"}`,
                      seasonCount > 1 ? `${seasonCount} seasons` : null,
                      totalSeconds > 0 ? formatDuration(totalSeconds) : null,
                      data.studios?.length ? data.studios.join(", ") : null,
                      years,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                {data.performers && data.performers.length > 0 && <CastLine cast={data.performers} />}



              </div>
            </div>

          </div>
        </section>

        <div className="mx-auto w-full max-w-[1276px] space-y-16 px-4 pb-20 md:px-12">
          <section className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-bold tracking-[-0.01em]">Episodes</h2>
                {/* Your progress through the series. */}
                <p className="text-[13px] text-zinc-500">
                  {[
                    `${watched} of ${all.length} watched`,
                    watchedSeconds > 60 ? `${formatDuration(Math.round(watchedSeconds))} watched` : null,
                    lastPlayed ? `last watched ${timeAgo(lastPlayed)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">

              {/* Seasons only when there is more than one. */}
              {seasonCount > 1 && (
                <div role="tablist" aria-label="Seasons" className="flex gap-1.5 overflow-x-auto">
                  {data.seasons.map((entry) => (
                    <button
                      key={entry.number}
                      type="button"
                      role="tab"
                      aria-selected={activeSeason === entry.number}
                      onClick={() => setSeason(entry.number)}
                      className={cn(
                        "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                        activeSeason === entry.number
                          ? "bg-white text-black"
                          : "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12] hover:text-white",
                      )}
                    >
                      Season {entry.number}
                    </button>
                  ))}
                </div>
              )}
              </div>
            </div>

            {shown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No episodes in this series yet.</p>
            ) : (
              <ol className="-mx-3">
                {shown.map((episode, index) => {
                  const progress = progressOf(episode);
                  const isNext = next?.id === episode.id;
                  return (
                    <li key={episode.id}>
                      {/* Between parts: a line in the accent colour, brightest
                          in the middle and fading out towards both ends. */}
                      {index > 0 && (
                        <span
                          aria-hidden
                          className="block h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => playFrom(episode, canResume(episode))}
                        className="group my-2 flex w-full items-center gap-4 rounded-2xl p-3 text-left transition-colors hover:bg-white/[0.04] md:gap-6"
                      >
                        {/* The number enormous and hollow, outlined in white
                            like the home page's chapter words, on the
                            thumbnail's top-left corner and hanging past it. */}
                        <span className="relative block shrink-0 sm:ml-10 sm:mt-8 md:ml-12 md:mt-10">
                        <span
                          aria-hidden
                          className={cn(
                            "absolute -left-10 -top-11 z-10 hidden select-none text-8xl font-black leading-none tracking-tighter tabular-nums sm:block md:-left-12 md:-top-14 md:text-9xl",
                            "drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] transition-opacity",
                            isNext ? "opacity-100" : "opacity-60 group-hover:opacity-90",
                          )}
                          style={{ color: "transparent", WebkitTextStroke: "2px #ffffff" }}
                        >
                          {String(episode.episodeNumber ?? 0).padStart(2, "0")}
                        </span>
                        <span className="relative block aspect-video w-40 shrink-0 overflow-hidden rounded-xl bg-secondary md:w-64">
                          <img
                            src={thumbnailUrl(episode)}
                            alt=""
                            loading="lazy"
                            className="sensitive size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                            <span className="flex size-11 items-center justify-center rounded-full bg-white text-black">
                              <Play className="size-5 translate-x-px fill-current" />
                            </span>
                          </span>
                          {episode.durationSeconds ? (
                            <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                              {formatDuration(episode.durationSeconds)}
                            </span>
                          ) : null}
                          {progress > 0 && progress < 1 && (
                            <span className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                              <span className="block h-full bg-primary" style={{ width: `${progress * 100}%` }} />
                            </span>
                          )}
                        </span>
                        </span>
                        <span className="min-w-0 flex-1 space-y-1.5">
                          <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            {partLabel(episode, seasonCount)}
                            {episode.releaseDate && ` · ${episode.releaseDate.slice(0, 4)}`}
                          </span>
                          {/* The title, with the Up next pill beside it. */}
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span className="sensitive truncate text-base font-semibold text-zinc-100 group-hover:text-white md:text-lg">
                              {episode.episodeTitle || episode.title}
                            </span>
                            {isNext && (
                              <span className="shrink-0 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                                Up next
                              </span>
                            )}
                          </span>
                          {/* Its synopsis, three lines at most. */}
                          {episode.description && (
                            <span className="sensitive line-clamp-3 text-[13px] leading-relaxed text-zinc-400">
                              {episode.description}
                            </span>
                          )}
                          {/* Who is in this episode — it can differ from the last. */}
                          {episode.performers && episode.performers.length > 0 && (
                            <EpisodeCast cast={episode.performers} />
                          )}
                          {/* Only when there is something to say: watched, or
                              partway through. Nothing for one not yet started. */}
                          {episode.completedAt ? (
                            <span className="flex items-center gap-1 text-[13px] text-emerald-400">
                              <Check className="size-3.5" /> Watched
                            </span>
                          ) : canResume(episode) ? (
                            <span className="block text-[13px] text-zinc-300">
                              {Math.round(progress * 100)}% watched · resume at{" "}
                              {formatTimestamp(episode.lastPositionSeconds ?? 0)}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <RelatedSeriesRow seriesId={id} />
        </div>
      </div>
    </AppShell>
  );
}
