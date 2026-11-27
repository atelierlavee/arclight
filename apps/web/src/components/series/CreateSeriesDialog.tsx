// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Search, X } from "lucide-react";
import { EditDialog } from "../EditDialog";
import type { MediaCardItem } from "../MediaCard";
import { EDIT_INPUT } from "@/lib/editForm";
import { framingStyle, thumbnailUrl, updateItem } from "@/lib/mediaItemApi";
import { qk } from "@/lib/queryKeys";
import { createSeries } from "@/lib/seriesApi";
import { invalidateItemEverywhere } from "@/lib/invalidate";
import { cn, formatDuration } from "@/lib/utils";

type Pick = MediaCardItem & { studio?: string | null; releaseDate?: string | null };

async function searchVideos(query: string): Promise<Pick[]> {
  const params = new URLSearchParams({ type: "video", q: query });
  const res = await fetch(`/api/media-items?${params}`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const body = (await res.json()) as { items?: Pick[] };
  return (body.items ?? []).filter((item) => item.itemType === "video").slice(0, 12);
}

/** The text typed, settled for a moment, so each keystroke isn't a request. */
function useSettled(value: string, ms = 250): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** A still and two lines about a video, shared by the results and the parts. */
function VideoLine({ item }: { item: Pick }) {
  return (
    <>
      <span className="block aspect-video w-20 shrink-0 overflow-hidden rounded-md bg-secondary">
        <img src={thumbnailUrl(item)} alt="" loading="lazy" style={framingStyle(item)} className="sensitive size-full object-cover" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="sensitive block truncate text-sm font-medium">{item.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {[item.studio, item.releaseDate?.slice(0, 4), formatDuration(item.durationSeconds)].filter(Boolean).join(" · ")}
        </span>
      </span>
    </>
  );
}

/**
 * Making a series by hand: a name, then videos found by search and put in
 * order — the order is the part numbering. For sagas the scanner can't spot
 * from file names. Opens the new series when done.
 */
export function CreateSeriesDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [term, setTerm] = useState("");
  const [parts, setParts] = useState<Pick[]>([]);
  const query = useSettled(term.trim());
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const results = useQuery({
    queryKey: qk.series.videoSearch(query),
    queryFn: () => searchVideos(query),
    enabled: query.length > 0,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async () => {
      const series = await createSeries(name.trim(), parts[0].id);
      // One at a time, in order, so a failure part-way leaves the first
      // parts numbered rather than a scatter.
      for (const [index, part] of parts.entries()) {
        await updateItem(part.id, { seriesId: series.id, seasonNumber: 1, episodeNumber: index + 1 });
      }
      return series;
    },
    onSuccess: (series) => {
      void queryClient.invalidateQueries({ queryKey: qk.series.all });
      for (const part of parts) invalidateItemEverywhere(queryClient, part.id);
      onClose();
      void navigate({ to: "/series/$seriesId", params: { seriesId: String(series.id) } });
    },
  });

  const add = (item: Pick) => setParts((current) => (current.some((p) => p.id === item.id) ? current : [...current, item]));
  const remove = (id: number) => setParts((current) => current.filter((p) => p.id !== id));
  const move = (index: number, by: -1 | 1) =>
    setParts((current) => {
      const next = [...current];
      const target = index + by;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const ready = name.trim().length > 0 && parts.length > 0 && !create.isPending;

  return (
    <EditDialog title="New story" onClose={onClose}>
      <label className="block space-y-1.5">
        <span className="text-xs text-muted-foreground">Name</span>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. LANA"
          className={EDIT_INPUT}
        />
      </label>

      {/* The parts, in order: the order is the numbering. */}
      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">
          Episodes {parts.length > 0 && `· ${parts.length}`}
        </span>
        {parts.length === 0 ? (
          <p className="rounded-lg bg-white/[0.03] px-3 py-4 text-center text-xs text-muted-foreground">
            Search below and add the videos, in order.
          </p>
        ) : (
          <ol className="space-y-1">
            {parts.map((part, index) => (
              <li key={part.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-1.5">
                <span className="w-12 shrink-0 text-center text-[11px] font-semibold text-muted-foreground">
                  Ep {index + 1}
                </span>
                <VideoLine item={part} />
                <span className="flex shrink-0 items-center">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up" className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30">
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === parts.length - 1} aria-label="Move down" className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30">
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => remove(part.id)} aria-label="Remove" className="rounded p-1 text-muted-foreground hover:text-destructive">
                    <X className="size-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Finding videos to add. */}
      <div className="space-y-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search your videos to add…"
            aria-label="Search videos to add"
            className={cn(EDIT_INPUT, "pl-8")}
          />
        </div>
        {query.length > 0 && (
          <div className="max-h-64 overflow-y-auto">
            {results.isFetching && !results.data ? (
              <Loader2 className="mx-auto my-4 size-4 animate-spin text-muted-foreground" />
            ) : results.error ? (
              <p className="py-3 text-xs text-destructive">{results.error.message}</p>
            ) : (results.data ?? []).length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">No videos match.</p>
            ) : (
              <ul className="space-y-0.5">
                {(results.data ?? []).map((item) => {
                  const added = parts.some((p) => p.id === item.id);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => add(item)}
                        disabled={added}
                        className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-white/[0.05] disabled:opacity-50"
                      >
                        <VideoLine item={item} />
                        {added ? (
                          <Check className="size-4 shrink-0 text-emerald-400" />
                        ) : (
                          <Plus className="size-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {create.error && <p className="text-xs text-destructive">{create.error.message}</p>}
      <button
        type="button"
        onClick={() => create.mutate()}
        disabled={!ready}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {create.isPending && <Loader2 className="size-4 animate-spin" />}
        Create story{parts.length > 0 && ` with ${parts.length} ${parts.length === 1 ? "episode" : "episodes"}`}
      </button>
    </EditDialog>
  );
}
