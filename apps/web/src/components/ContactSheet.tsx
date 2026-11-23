// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark as BookmarkIcon, Flame, LayoutGrid, Loader2, X } from "lucide-react";
import { Portal } from "./Portal";
import { useFocusTrap } from "@/lib/useFocusTrap";
import {
  formatTimestamp,
  useScrubSprite,
  VideoOfflineError,
  type Bookmark,
  type ScrubSprite,
} from "@/lib/bookmarkApi";
import { HEATMAP_MIN_PEAK } from "@/lib/heatmap";
import { cn } from "@/lib/utils";
import { pickFrames, type Frame } from "@/lib/contactSheet";

/** How many frames each density shows; "all" is every frame the sheet has. */
const DENSITIES = [
  { value: 20, label: "20" },
  { value: 50, label: "50" },
  { value: Infinity, label: "All" },
] as const;

/** A heatmap bucket counts as hot at this share of the video's busiest one. */
const HOT_SHARE = 0.6;

/** The CSS that shows one cell of the sprite, scaled to fill its tile. */
function cellStyle(sprite: ScrubSprite, index: number): React.CSSProperties {
  const rows = Math.ceil(sprite.count / sprite.columns);
  const column = index % sprite.columns;
  const row = Math.floor(index / sprite.columns);
  // Percentages position relative to (image − box), so the last column is
  // 100% and the first 0%; a single column or row has nowhere to move.
  const x = sprite.columns > 1 ? (column / (sprite.columns - 1)) * 100 : 0;
  const y = rows > 1 ? (row / (rows - 1)) * 100 : 0;
  return {
    backgroundImage: `url(${sprite.url})`,
    backgroundSize: `${sprite.columns * 100}% ${rows * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
    aspectRatio: `${sprite.tileWidth} / ${sprite.tileHeight}`,
  };
}

/**
 * The whole video as a grid of frames: skim it at a glance, click a frame to
 * play from there.
 *
 * Drawn from the seek bar's preview sheet rather than frames of its own, so
 * it costs nothing extra on disk and is instant for anything already
 * scrubbed. Frames in the most-replayed stretch carry a flame, and those
 * with a bookmark in their span carry its marker.
 */
export function ContactSheet({
  itemId,
  title,
  durationSeconds,
  bookmarks,
  heatmapBuckets,
  onPick,
  onClose,
}: {
  itemId: number;
  title: string;
  durationSeconds: number | null;
  bookmarks: Bookmark[];
  heatmapBuckets: number[] | undefined;
  onPick: (seconds: number) => void;
  onClose: () => void;
}) {
  const { data: sprite, isPending, isError, error } = useScrubSprite(itemId, true);
  const [density, setDensity] = useState<number>(50);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(dialogRef);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Capture phase, and every key stopped: the player behind listens on the
  // window, and arrows or space reaching it would seek a video you cannot see.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Tab") return;
      event.stopPropagation();
      if (event.key === "Escape" || event.key === "g" || event.key === "G") {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, []);

  const duration = durationSeconds ?? 0;
  const frames = useMemo(
    () => (sprite ? pickFrames(sprite, density, duration) : []),
    [sprite, density, duration],
  );

  const hotFloor = useMemo(() => {
    const peak = heatmapBuckets?.length ? Math.max(...heatmapBuckets) : 0;
    return peak >= HEATMAP_MIN_PEAK ? Math.max(HEATMAP_MIN_PEAK, peak * HOT_SHARE) : Infinity;
  }, [heatmapBuckets]);

  function isHot(frame: Frame): boolean {
    if (!heatmapBuckets?.length || !(duration > 0) || hotFloor === Infinity) return false;
    const n = heatmapBuckets.length;
    const from = Math.floor((frame.seconds / duration) * n);
    const to = Math.max(from, Math.ceil((frame.untilSeconds / duration) * n) - 1);
    for (let b = from; b <= Math.min(n - 1, to); b++) {
      if (heatmapBuckets[b] >= hotFloor) return true;
    }
    return false;
  }

  function bookmarkIn(frame: Frame): Bookmark | undefined {
    return bookmarks.find(
      (bookmark) =>
        bookmark.positionSeconds >= frame.seconds && bookmark.positionSeconds < frame.untilSeconds,
    );
  }

  return (
    <Portal>
      <div
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-6"
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-sheet-title"
          className="animate-soft-pop w-full max-w-6xl space-y-4 rounded-xl border border-border bg-card p-4 shadow-2xl sm:p-5"
        >
          <div className="flex flex-wrap items-center gap-3">
            <h2
              id="contact-sheet-title"
              className="sensitive flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold"
            >
              <LayoutGrid className="size-4 shrink-0" />
              <span className="truncate">{title}</span>
            </h2>
            <div role="group" aria-label="Frames shown" className="flex rounded-md bg-secondary p-0.5 text-xs">
              {DENSITIES.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setDensity(option.value)}
                  aria-pressed={density === option.value}
                  className={cn(
                    "rounded px-2.5 py-1 transition-colors",
                    density === option.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close contact sheet"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {isPending && (
            <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Pulling frames from the video…
            </p>
          )}
          {isError && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {error instanceof VideoOfflineError
                ? "This video's drive isn't connected. Plug it in and open the contact sheet again."
                : "No frames could be read from this video."}
            </p>
          )}

          {sprite && (
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {frames.map((frame) => {
                const hot = isHot(frame);
                const bookmark = bookmarkIn(frame);
                return (
                  <li key={frame.index}>
                    <button
                      type="button"
                      onClick={() => onPick(frame.seconds)}
                      aria-label={`Play from ${formatTimestamp(frame.seconds)}`}
                      className="group relative block w-full overflow-hidden rounded-md bg-black outline-none ring-offset-2 ring-offset-card focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div
                        className="sensitive w-full bg-no-repeat transition-transform duration-200 group-hover:scale-[1.04]"
                        style={cellStyle(sprite, frame.index)}
                      />
                      <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                        {formatTimestamp(frame.seconds)}
                      </span>
                      <span className="absolute right-1 top-1 flex gap-1">
                        {hot && (
                          <span title="Most replayed" className="rounded bg-black/75 p-0.5">
                            <Flame className="size-3.5 text-orange-400" />
                          </span>
                        )}
                        {bookmark && (
                          <span
                            title={bookmark.label ?? "Bookmark"}
                            className="rounded bg-black/75 p-0.5"
                          >
                            <BookmarkIcon className="size-3.5 fill-sky-400 text-sky-400" />
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </Portal>
  );
}
