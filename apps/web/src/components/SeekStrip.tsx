// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { Flame } from "lucide-react";
import { useRef, useState } from "react";
import {
  formatTimestamp,
  spriteFrameAt,
  type Bookmark,
  type ScrubSprite,
} from "@/lib/bookmarkApi";
import { layoutMarkers, markerAt, markerColor, type Marker } from "@/lib/markerApi";
import { cn } from "@/lib/utils";

/** How close, in pixels, a press has to land to a bookmark to snap onto it. */
const SNAP_PX = 8;
/** The preview is drawn at the sheet's own tile width, so it is never upscaled. */
const PREVIEW_MAX_WIDTH = 160;

/** The heatmap's buckets as points across a 100×100 box, y growing downwards. */
function heatmapPoints(counts: number[], max: number): [number, number][] {
  const last = counts.length - 1;
  return counts.map((count, i) => [
    last > 0 ? (i / last) * 100 : 50,
    100 - (count / max) * 92,
  ]);
}

/**
 * A smooth line through the points: Catmull-Rom turned into cubic curves,
 * with the control points' height clamped so the curve never overshoots
 * above the box or below the bar.
 */
function heatmapLine(counts: number[], max: number): string {
  const points = heatmapPoints(counts, max);
  if (points.length === 0) return "";
  const clampY = (y: number) => Math.min(100, Math.max(0, y));
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[Math.max(0, i - 1)];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const [x3, y3] = points[Math.min(points.length - 1, i + 2)];
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = clampY(y1 + (y2 - y0) / 6);
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = clampY(y2 - (y3 - y1) / 6);
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`;
  }
  return d;
}

/** The same curve closed down to the bar, for the faint fill under it. */
function heatmapArea(counts: number[], max: number): string {
  const line = heatmapLine(counts, max);
  return line ? `${line} L100,100 L0,100 Z` : "";
}

/**
 * A seek bar that shows where you are going before you get there.
 *
 * Sits above the browser's own control bar rather than replacing it. The
 * native bar cannot be told to draw a preview or a tick — it exposes no
 * hover position at all — and rebuilding play, volume, captions, AirPlay and
 * fullscreen to get one would be a lot of player to own for one feature.
 *
 * Works as a plain seek bar until the sprite arrives, and forever if it never
 * does: the preview is an addition to seeking, not a condition of it.
 *
 * Pointer events rather than mouse events, so dragging a thumb along it on a
 * phone scrubs with the same preview as hovering does on a desktop.
 */
export function SeekStrip({
  duration,
  currentTime,
  sprite,
  bookmarks,
  markers = [],
  heatmap,
  visible,
  onSeek,
  onJumpToBest,
  besidePanel = false,
}: {
  duration: number;
  currentTime: number;
  sprite: ScrubSprite | undefined;
  bookmarks: Bookmark[];
  /** Named positions, shown by name in the hover label. */
  markers?: Marker[];
  heatmap?: number[];
  visible: boolean;
  onSeek: (seconds: number) => void;
  /** Jumps to the most replayed part; the button only shows once there is one. */
  onJumpToBest?: () => void;
  /** The queue is open over the right of the frame; stop short of it. */
  besidePanel?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; width: number; seconds: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const heatmapMax = heatmap ? Math.max(...heatmap) : 0;
  // Not drawn on the line; only named in the hover label.
  const segments = layoutMarkers(markers, duration);

  if (!(duration > 0)) return null;

  /** The time under a pointer, snapped to a bookmark when one is that close. */
  function locate(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const x = Math.min(rect.width, Math.max(0, clientX - rect.left));
    const near = bookmarks.find(
      (bookmark) => Math.abs((bookmark.positionSeconds / duration) * rect.width - x) <= SNAP_PX,
    );
    const seconds = near ? near.positionSeconds : (x / rect.width) * duration;
    return { x: near ? (near.positionSeconds / duration) * rect.width : x, width: rect.width, seconds, near };
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const spot = locate(event.clientX);
    if (!spot) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setHover(spot);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const spot = locate(event.clientX);
    if (spot) setHover(spot);
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    const spot = locate(event.clientX);
    if (spot) onSeek(spot.seconds);
    // A touch has no hover to leave, so the preview would otherwise stay up.
    if (event.pointerType !== "mouse") setHover(null);
  }

  const shown = visible || dragging || hover !== null;
  const progress = Math.min(100, (currentTime / duration) * 100);
  const hoveredBookmark = hover
    ? bookmarks.find((bookmark) => bookmark.positionSeconds === hover.seconds)
    : undefined;
  const hoveredMarker = hover ? markerAt(segments, hover.seconds) : undefined;

  const previewWidth = sprite ? Math.min(PREVIEW_MAX_WIDTH, sprite.tileWidth) : 0;
  const previewScale = sprite ? previewWidth / sprite.tileWidth : 1;
  const previewHeight = sprite ? sprite.tileHeight * previewScale : 0;
  // Kept inside the track, so the preview never hangs off the frame at
  // either end of the video.
  const bubbleWidth = Math.max(previewWidth, 56);
  const bubbleLeft = hover
    ? Math.min(hover.width - bubbleWidth / 2, Math.max(bubbleWidth / 2, hover.x))
    : 0;
  const frame = sprite && hover ? spriteFrameAt(sprite, hover.seconds) : null;

  return (
    <div
      className={cn(
        "absolute bottom-14 left-4 z-20 transition-opacity duration-300",
        besidePanel ? "right-[21.25rem]" : "right-4",
        shown ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {onJumpToBest && heatmapMax > 1 && (
        <button
          type="button"
          onClick={onJumpToBest}
          title="Jump to the most replayed part (H)"
          className="absolute bottom-full right-0 mb-8 flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white ring-1 ring-white/20 backdrop-blur transition-colors hover:bg-black/85"
        >
          <Flame className="size-3 text-orange-400" />
          Best part
        </button>
      )}

      {hover && (
        <div
          className="pointer-events-none absolute bottom-5 flex -translate-x-1/2 flex-col items-center gap-1"
          style={{ left: bubbleLeft }}
        >
          {sprite && frame && (
            <div
              className="overflow-hidden rounded-md shadow-xl ring-1 ring-white/25"
              style={{
                width: previewWidth,
                height: previewHeight,
                backgroundImage: `url(${sprite.url})`,
                backgroundPosition: `-${frame.x * previewScale}px -${frame.y * previewScale}px`,
                backgroundSize: `${sprite.columns * sprite.tileWidth * previewScale}px auto`,
              }}
            />
          )}
          <span className="max-w-[14rem] truncate rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
            {formatTimestamp(hover.seconds)}
            {hoveredBookmark?.label && ` · ${hoveredBookmark.label}`}
            {hoveredMarker && !hoveredBookmark?.label && (
              <>
                {" · "}
                <span style={{ color: markerColor(hoveredMarker.title) }}>{hoveredMarker.title}</span>
              </>
            )}
          </span>
        </div>
      )}

      <div
        ref={trackRef}
        role="slider"
        tabIndex={-1}
        aria-label="Seek with preview"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={formatTimestamp(currentTime)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          setDragging(false);
          setHover(null);
        }}
        onPointerLeave={(event) => {
          if (!dragging && event.pointerType === "mouse") setHover(null);
        }}
        // A tall hit area around a thin line: the line is what you see, the
        // padding is what a thumb can actually land on.
        className="group relative flex h-5 cursor-pointer touch-none items-center"
      >
        {heatmapMax > 1 && heatmap && (
          // How often each part has been watched, as one soft curve hugging
          // the bar — read as a graph at a glance, where separate blocks
          // looked like stray boxes when only a part had any history.
          <svg
            aria-hidden
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-x-0 bottom-1/2 h-8 w-full opacity-0 transition-opacity group-hover:opacity-100"
          >
            <path d={heatmapArea(heatmap, heatmapMax)} className="fill-white/15" />
            <path
              d={heatmapLine(heatmap, heatmapMax)}
              fill="none"
              vectorEffect="non-scaling-stroke"
              className="stroke-white/45"
              strokeWidth={1.25}
            />
          </svg>
        )}
        <div className="relative h-1 w-full rounded-full bg-white/25 transition-[height] group-hover:h-1.5">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white/80"
            style={{ width: `${progress}%` }}
          />
          {hover && (
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/30"
              style={{ width: `${(hover.seconds / duration) * 100}%` }}
            />
          )}
          {bookmarks.map((bookmark) => (
            <span
              key={bookmark.id}
              className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400 shadow ring-1 ring-black/40"
              style={{ left: `${Math.min(100, (bookmark.positionSeconds / duration) * 100)}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
