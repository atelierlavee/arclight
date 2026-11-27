// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, Loader2, Play, Plus, Search, Sparkles, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SilkWaves } from "@/components/home/LibraryScenes";
import { CreateSeriesDialog } from "@/components/series/CreateSeriesDialog";
import {
  finished,
  nextOf,
  progressOf,
  SeriesCard,
  started,
  usePerformerPortraits,
} from "@/components/series/SeriesCard";
import {
  createSeries,
  fetchSeries,
  fetchSeriesSuggestions,
  type SeriesSuggestion,
  type SeriesSummary,
} from "@/lib/seriesApi";
import { thumbnailUrl, updateItem } from "@/lib/mediaItemApi";
import { openWatchPage } from "@/lib/appEvents";
import { formatTimestamp } from "@/lib/bookmarkApi";
import { invalidateItemEverywhere } from "@/lib/invalidate";
import { qk } from "@/lib/queryKeys";
import { useIsOwner } from "@/lib/profile";
import { cn } from "@/lib/utils";

type Sort = "watched" | "added" | "name" | "unwatched";

const SORTS: { value: Sort; label: string }[] = [
  { value: "watched", label: "Recently watched" },
  { value: "added", label: "Recently added" },
  { value: "name", label: "A–Z" },
  { value: "unwatched", label: "Unwatched first" },
];
const SORT_KEY = "series-list-sort";
const DISMISSED_KEY = "series-suggestions-dismissed";
function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A preference that won't persist; nothing to surface.
  }
}

/** Series you're partway through, most recently watched first. */
function ContinueRow({ series }: { series: SeriesSummary[] }) {
  const going = series
    .filter((entry) => started(entry) && !finished(entry) && nextOf(entry))
    .sort((a, b) => (b.lastPlayedAt ?? "").localeCompare(a.lastPlayedAt ?? ""));
  if (going.length === 0) return null;
  return (
    <section className="space-y-5">
      <h2 className="text-xl font-bold tracking-[-0.01em]">Continue watching</h2>
      <div className="scrollbar-hide -mx-1 flex snap-x gap-5 overflow-x-auto px-1 pb-1">
        {going.map((entry) => {
          const next = nextOf(entry)!;
          const progress = progressOf(next.episode);
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => openWatchPage(next.episode.id, { resume: next.resume })}
              className="group w-72 shrink-0 snap-start space-y-3 text-left md:w-80"
            >
              <span className="relative block aspect-video overflow-hidden rounded-2xl bg-secondary ring-1 ring-white/10">
                <img
                  src={thumbnailUrl({ id: next.episode.id })}
                  alt=""
                  loading="lazy"
                  className="sensitive size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="flex size-12 items-center justify-center rounded-full bg-white text-black">
                    <Play className="size-5 translate-x-px fill-current" />
                  </span>
                </span>
                {progress > 0 && (
                  <span className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                    <span className="block h-full bg-primary" style={{ width: `${progress * 100}%` }} />
                  </span>
                )}
              </span>
              <span className="block space-y-1">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  {next.resume ? "Continue" : "Next"} · Ep {next.number}
                  {next.resume && ` · ${formatTimestamp(next.episode.position)}`}
                </span>
                <span className="sensitive block truncate text-[15px] font-semibold text-zinc-100 group-hover:text-white">
                  {entry.name}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Likely series found in the library, each made in one click. */
function Suggestions() {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<string[]>(() => readLocal<string[]>(DISMISSED_KEY, []));
  const { data } = useQuery({ queryKey: qk.series.suggestions, queryFn: fetchSeriesSuggestions });
  const create = useMutation({
    mutationFn: async (suggestion: SeriesSuggestion) => {
      const created = await createSeries(suggestion.name, suggestion.items[0].id);
      for (const [index, item] of suggestion.items.entries()) {
        await updateItem(item.id, { seriesId: created.id, seasonNumber: 1, episodeNumber: index + 1 });
      }
      return suggestion;
    },
    onSuccess: (suggestion) => {
      void queryClient.invalidateQueries({ queryKey: qk.series.all });
      for (const item of suggestion.items) invalidateItemEverywhere(queryClient, item.id);
    },
  });

  const shown = (data?.suggestions ?? []).filter((suggestion) => !dismissed.includes(suggestion.key));
  if (shown.length === 0) return null;
  const dismiss = (key: string) => {
    const next = [...dismissed, key];
    setDismissed(next);
    writeLocal(DISMISSED_KEY, next);
  };

  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-[-0.01em]">
          <Sparkles className="size-5 text-primary" />
          Suggested stories
        </h2>
        <p className="text-[13px] text-zinc-500">Videos from one studio numbered as parts of the same story.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {shown.map((suggestion) => {
          const pending = create.isPending && create.variables?.key === suggestion.key;
          return (
            <div key={suggestion.key} className="space-y-4 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="sensitive truncate text-base font-semibold text-white">{suggestion.name}</p>
                  <p className="text-xs text-zinc-500">
                    {[suggestion.studio, `${suggestion.items.length} episodes`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(suggestion.key)}
                  aria-label={`Dismiss ${suggestion.name}`}
                  title="Not a story"
                  className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="scrollbar-hide flex gap-2 overflow-x-auto">
                {suggestion.items.map((item, index) => (
                  <span key={item.id} className="relative block aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-secondary" title={item.title}>
                    <img src={thumbnailUrl({ id: item.id })} alt="" loading="lazy" className="sensitive size-full object-cover" />
                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] font-bold text-white">Ep {index + 1}</span>
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => create.mutate(suggestion)}
                disabled={create.isPending}
                className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                New story
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The series list: what you're partway through, likely series to make, and
 * every series as a fanned cover with its progress — sortable and
 * searchable once there are enough to need it.
 */
export function SeriesPageIndex() {
  const { data, isLoading } = useQuery({ queryKey: qk.series.all, queryFn: () => fetchSeries() });
  const all = data?.series ?? [];
  const isOwner = useIsOwner();
  const portraits = usePerformerPortraits();
  const [creating, setCreating] = useState(false);
  const [sort, setSortState] = useState<Sort>(() => readLocal<Sort>(SORT_KEY, "watched"));
  const [query, setQuery] = useState("");
  const setSort = (next: Sort) => {
    setSortState(next);
    writeLocal(SORT_KEY, next);
  };

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = term ? all.filter((entry) => entry.name.toLowerCase().includes(term)) : all;
    const byName = (a: SeriesSummary, b: SeriesSummary) => a.name.localeCompare(b.name);
    return [...filtered].sort((a, b) => {
      if (sort === "name") return byName(a, b);
      if (sort === "added") return (b.newestAddedAt ?? "").localeCompare(a.newestAddedAt ?? "") || byName(a, b);
      if (sort === "unwatched") {
        return Number(started(a)) - Number(started(b)) || b.unwatched - a.unwatched || byName(a, b);
      }
      return (b.lastPlayedAt ?? "").localeCompare(a.lastPlayedAt ?? "") || byName(a, b);
    });
  }, [all, query, sort]);

  const showControls = all.length > 4;
  // A few series get room; a grid of tiny cards would be mostly empty.
  const large = all.length > 0 && all.length <= 3;

  return (
    <AppShell>
      <div className="relative isolate">
        {/* The home page's silk, faint, behind the title. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-10 -z-10 h-[360px] overflow-hidden">
          <SilkWaves className="absolute right-0 top-1/2 h-[70%] w-[45%] -translate-y-1/2 opacity-30" />
        </div>

        <div className="mx-auto w-full max-w-[1276px] space-y-14 px-4 pb-20 pt-[84px] md:px-12">
          <header className="flex flex-wrap items-end justify-between gap-6">
            <div className="space-y-2">
              <h1 className="text-4xl font-black tracking-tight text-white md:text-6xl">Stories</h1>
              <p className="text-lg font-medium text-zinc-300 md:text-xl">
                Desire has many chapters. <span className="text-primary">Explore them all.</span>
              </p>
              {all.length > 0 && (
                <p className="text-sm text-zinc-500">
                  {`${all.length} ${all.length === 1 ? "story" : "stories"} · ${all.reduce((n, entry) => n + entry.episodeCount, 0)} episodes`}
                </p>
              )}
            </div>
            {isOwner && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="size-4" />
                New story
              </button>
            )}
          </header>

          <ContinueRow series={all} />

          {isOwner && <Suggestions />}

          <section className="space-y-6">
            {all.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-xl font-bold tracking-[-0.01em]">All stories</h2>
                {showControls && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search stories"
                        aria-label="Search stories"
                        className="h-9 w-48 rounded-full bg-white/[0.06] pl-9 pr-3 text-sm outline-none ring-1 ring-transparent transition focus:ring-primary/60"
                      />
                    </div>
                    <div role="radiogroup" aria-label="Sort stories" className="flex flex-wrap gap-1">
                      {SORTS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={sort === option.value}
                          onClick={() => setSort(option.value)}
                          className={cn(
                            "h-9 rounded-full px-3.5 text-[13px] font-medium transition-colors",
                            sort === option.value
                              ? "bg-white text-black"
                              : "text-zinc-400 hover:bg-white/[0.06] hover:text-white",
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {isLoading ? (
              <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="skeleton aspect-video rounded-2xl" />
                ))}
              </div>
            ) : all.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Film className="size-8 text-muted-foreground" />
                <p className="text-base font-semibold">No stories yet</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Create one from the videos of a saga, or take a suggestion above. Files named like S01E01 are grouped
                  when scanning too.
                </p>
              </div>
            ) : visible.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No stories match “{query}”.</p>
            ) : (
              <div
                className={cn(
                  "stagger grid gap-x-6 gap-y-12",
                  large ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
                )}
              >
                {visible.map((entry) => (
                  <SeriesCard key={entry.id} entry={entry} portraits={portraits} large={large} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      {creating && <CreateSeriesDialog onClose={() => setCreating(false)} />}
    </AppShell>
  );
}
