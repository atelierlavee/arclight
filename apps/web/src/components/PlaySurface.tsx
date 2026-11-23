// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Armchair, ChevronDown, Dices, Play, RotateCcw } from "lucide-react";
import { filterParams } from "@/lib/filters";
import { LEAN_BACK_LENGTHS, endLeanBack, startLeanBack } from "@/lib/leanBack";
import { fetchHeatmap } from "./mediaDetail/useLeanBack";
import { useQueue, type QueueItem } from "@/lib/queue";
import type { MediaCardItem } from "./MediaCard";
import type { GridSource } from "./MediaGrid";
import { qk } from "@/lib/queryKeys";

const MIN_RESUMABLE_SECONDS = 15;
const PLAY_EVENT = "media-server:play-item";

type PageItem = Pick<
  MediaCardItem,
  "id" | "title" | "thumbnailFile" | "durationSeconds" | "itemType"
> & {
  lastPositionSeconds?: number;
};

type Response = {
  items: PageItem[];
  page: number;
  pageSize: number;
  hasMore?: boolean;
};

async function fetchPage(source: GridSource, page: number): Promise<Response> {
  if (source.type === "collection") {
    const response = await fetch(
      `/api/collections/${source.id}/items?page=${page}`,
    );
    if (!response.ok)
      throw new Error(`Failed to load collection: ${response.status}`);
    return response.json();
  }

  // The browse page's filters too, so playing a filtered view plays what it shows.
  const params = source.filters ? filterParams(source.filters) : new URLSearchParams();
  params.set("page", String(page));
  params.set("sort", "newest");
  if (source.tag) params.set("tag", source.tag);
  if (source.performer) params.set("performer", source.performer);
  if (source.studio) params.set("studio", source.studio);
  if (source.kind) params.set("kind", source.kind);
  if (source.q) params.set("q", source.q);
  if (source.parentId !== null) params.set("parentId", String(source.parentId));
  const response = await fetch(`/api/media-items?${params}`);
  if (!response.ok) throw new Error(`Failed to load media: ${response.status}`);
  return response.json();
}

export function PlaySurface({
  source,
  items: directItems,
  label = "Play surface",
}: {
  source?: GridSource;
  items?: PageItem[];
  label?: string;
}) {
  const { add, clear } = useQueue();
  const queryClient = useQueryClient();
  const [leanBackMenu, setLeanBackMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click away closes the length menu.
  useEffect(() => {
    if (!leanBackMenu) return;
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setLeanBackMenu(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [leanBackMenu]);
  const { data, isLoading } = useQuery({
    queryKey: qk.playSurface.list(source, directItems?.map((item) => item.id)),
    queryFn: async () => {
      if (directItems) return directItems;
      if (!source) return [];
      const all: PageItem[] = [];
      let page = 1;
      while (true) {
        const response = await fetchPage(source, page);
        all.push(...response.items);
        const hasMore =
          response.hasMore ?? response.items.length === response.pageSize;
        if (!hasMore) return all;
        page += 1;
      }
    },
    enabled: Boolean(source || directItems),
    staleTime: 30_000,
  });

  const videos = (data ?? []).filter((item) => item.itemType === "video");
  const resumeItem = videos.find(
    (item) =>
      (item.lastPositionSeconds ?? 0) > MIN_RESUMABLE_SECONDS &&
      (item.durationSeconds == null ||
        (item.lastPositionSeconds ?? 0) <
          item.durationSeconds - MIN_RESUMABLE_SECONDS),
  );

  function toQueueItem(item: PageItem): QueueItem {
    return {
      id: item.id,
      title: item.title,
      thumbnailFile: item.thumbnailFile,
      durationSeconds: item.durationSeconds,
    };
  }

  function play(items: PageItem[]) {
    if (!items[0]) return;
    // An ordinary Play All is not a lean-back session, even if one was running.
    endLeanBack();
    clear();
    items.slice(1).forEach((item) => add(toQueueItem(item)));
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: items[0].id }));
  }

  /**
   * Shuffles everything here into the queue and plays it hands-free — see
   * lib/leanBack.ts. For clips, the first video's heatmap is fetched first
   * so even it starts at its best part.
   */
  async function leanBack(clipSeconds: number | null) {
    setLeanBackMenu(false);
    const shuffled = shuffle(videos);
    if (!shuffled[0]) return;
    if (clipSeconds) {
      await queryClient
        .prefetchQuery({
          queryKey: qk.heatmap(shuffled[0].id),
          queryFn: () => fetchHeatmap(shuffled[0].id),
          staleTime: 60_000,
        })
        .catch(() => {});
    }
    clear();
    shuffled.slice(1).forEach((item) => add(toQueueItem(item)));
    startLeanBack({ clipSeconds });
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: shuffled[0].id }));
  }

  function resume() {
    if (!resumeItem) return;
    clear();
    window.dispatchEvent(
      new CustomEvent(PLAY_EVENT, {
        detail: { id: resumeItem.id, resume: true },
      }),
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={label}>
      <button
        type="button"
        onClick={() => play(videos)}
        disabled={isLoading || videos.length === 0}
        className="flex items-center gap-2 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-colors hover:bg-foreground/85 disabled:opacity-40"
      >
        <Play className="size-4 fill-current" /> Play All
      </button>
      <button
        type="button"
        onClick={() => play(shuffle(videos))}
        disabled={isLoading || videos.length === 0}
        className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-40"
      >
        <Dices className="size-4" /> Shuffle
      </button>
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setLeanBackMenu((open) => !open)}
          disabled={isLoading || videos.length === 0}
          aria-expanded={leanBackMenu}
          aria-haspopup="menu"
          title="Shuffle and play hands-free in cinema mode"
          className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-40"
        >
          <Armchair className="size-4" /> Lean back
          <ChevronDown className="size-3.5 opacity-60" />
        </button>
        {leanBackMenu && (
          <div
            role="menu"
            className="animate-soft-pop absolute left-0 top-full z-40 mt-1 w-44 overflow-hidden rounded-md border border-border bg-card py-1 shadow-xl"
          >
            {LEAN_BACK_LENGTHS.map((length) => (
              <button
                key={length.label}
                type="button"
                role="menuitem"
                onClick={() => void leanBack(length.clipSeconds)}
                className="block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent"
              >
                {length.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {resumeItem && (
        <button
          type="button"
          onClick={resume}
          className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm transition-colors hover:bg-accent"
        >
          <RotateCcw className="size-4" /> Resume
        </button>
      )}
    </div>
  );
}

/** A fair shuffle (Fisher–Yates); sorting by a random key is not one. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
