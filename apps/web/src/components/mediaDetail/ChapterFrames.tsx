// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { cellStyle } from "../ContactSheet";
import { SharpFrame } from "../SharpFrame";
import { formatTimestamp, useScrubSprite } from "@/lib/bookmarkApi";
import type { Marker } from "@/lib/markerApi";
import { framingStyle, thumbnailUrl, type MediaItemDetail } from "@/lib/mediaItemApi";
import { cn, formatDuration } from "@/lib/utils";

/**
 * The video's chapters as a single row of frames, scrolled sideways: a still
 * from each one, its name, and when it starts. A click plays from there.
 *
 * Each still is a full-size frame the server extracts once and caches. While
 * it loads, the tile shows that moment from the seek bar's small preview
 * sheet (or the video's thumbnail before the sheet exists), so the row is
 * never empty.
 */
export function ChapterFrames({
  item,
  markers,
  currentTime = null,
  onJump,
}: {
  item: MediaItemDetail;
  markers: Marker[];
  /** Where playback is, while playing; null before. */
  currentTime?: number | null;
  onJump: (seconds: number) => void;
}) {
  const { data: sprite } = useScrubSprite(item.id, markers.length > 0);
  const rowRef = useRef<HTMLOListElement>(null);
  const scroll = (direction: 1 | -1) =>
    rowRef.current?.scrollBy({ left: direction * rowRef.current.clientWidth * 0.8 });
  const duration = item.durationSeconds ?? 0;
  const sorted = [...markers].sort((a, b) => a.startSeconds - b.startSeconds);

  // The chapter playing now: the last one that has started.
  let activeIndex = -1;
  if (currentTime != null) {
    sorted.forEach((marker, index) => {
      if (marker.startSeconds <= currentTime + 0.5) activeIndex = index;
    });
  }
  const activeId = activeIndex >= 0 ? sorted[activeIndex].id : null;

  // Keeps the playing chapter in view as playback moves on: the row scrolls
  // sideways only, never the page, and only when the chapter changes.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || activeId == null) return;
    const tile = row.querySelector<HTMLElement>(`[data-chapter="${activeId}"]`);
    if (!tile) return;
    const inView = tile.offsetLeft >= row.scrollLeft && tile.offsetLeft + tile.offsetWidth <= row.scrollLeft + row.clientWidth;
    if (!inView) row.scrollTo({ left: Math.max(0, tile.offsetLeft - 16), behavior: "smooth" });
  }, [activeId]);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold tracking-[-0.01em]">
        Chapters <span className="ml-1 font-medium tabular-nums text-zinc-500">{markers.length}</span>
      </h2>
      {/* One row, scrolled sideways (or with the arrows) when it runs long. */}
      <div className="group/row relative">
      <ol
        ref={rowRef}
        className="scrollbar-hide flex snap-x snap-mandatory gap-3.5 overflow-x-auto scroll-smooth"
      >
        {sorted.map((marker, index) => {
          const end = marker.endSeconds ?? sorted[index + 1]?.startSeconds ?? duration;
          const length = Math.max(0, end - marker.startSeconds);
          // A moment into the chapter rather than its first frame, which is
          // often the cut from the one before.
          const at = Math.round(marker.startSeconds + Math.min(3, length / 2));
          const frame =
            sprite &&
            Math.min(sprite.count - 1, Math.max(0, Math.floor(at / sprite.interval)));
          const active = marker.id === activeId;
          const progress =
            active && currentTime != null && length > 0
              ? Math.min(100, ((currentTime - marker.startSeconds) / length) * 100)
              : 0;
          return (
            <li key={marker.id} data-chapter={marker.id} className="w-44 shrink-0 snap-start md:w-48">
              <button
                type="button"
                onClick={() => onJump(marker.startSeconds)}
                title={`Play from ${marker.title}`}
                aria-current={active ? "true" : undefined}
                className="group flex w-full flex-col gap-2 text-left"
              >
                <span className="relative block aspect-video w-full overflow-hidden rounded-[10px] bg-secondary">
                  {sprite && frame != null ? (
                    <span
                      aria-hidden
                      className="sensitive block size-full bg-no-repeat"
                      style={cellStyle(sprite, frame)}
                    />
                  ) : (
                    <img
                      src={thumbnailUrl(item)}
                      alt=""
                      loading="lazy"
                      style={framingStyle(item)}
                      className="sensitive size-full object-cover opacity-60"
                    />
                  )}
                  <SharpFrame itemId={item.id} seconds={at} />
                  {/* The playing chapter: a "Now" tag and how far into it. */}
                  {active && (
                    <>
                      {/* Its own layer, so the frame image can't cover it. */}
                      <span className="pointer-events-none absolute inset-0 z-10 rounded-[10px] ring-2 ring-inset ring-primary" />
                      <span className="absolute left-1.5 top-1.5 z-10 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                        Now
                      </span>
                      <span className="absolute inset-x-0 bottom-0 z-10 h-1 bg-black/50">
                        <span className="block h-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} />
                      </span>
                    </>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center rounded-[10px] bg-black/35 opacity-0 ring-2 ring-inset ring-primary/70 transition-opacity group-hover:opacity-100">
                    <span className="flex size-9 items-center justify-center rounded-full bg-white text-black">
                      <Play className="size-4 translate-x-px fill-current" />
                    </span>
                  </span>
                </span>
                <span
                  className={cn(
                    "truncate text-[13px] font-semibold group-hover:text-white",
                    active ? "text-white" : "text-zinc-100",
                  )}
                >
                  {marker.title}
                </span>
                <span className="-mt-1 text-xs tabular-nums text-zinc-500">
                  {formatTimestamp(marker.startSeconds)}
                  {length > 0 && ` · ${formatDuration(length)}`}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {sorted.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label="Previous chapters"
            className="absolute -left-4 top-[calc((100%-2.75rem)/2)] flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/75 text-white opacity-0 shadow-lg backdrop-blur-sm transition-opacity hover:bg-black group-hover/row:opacity-100"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label="Next chapters"
            className="absolute -right-4 top-[calc((100%-2.75rem)/2)] flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/75 text-white opacity-0 shadow-lg backdrop-blur-sm transition-opacity hover:bg-black group-hover/row:opacity-100"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      )}
      </div>
    </section>
  );
}
