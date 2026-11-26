// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { HeaderStart } from "../shellContext";
import { formatTimestamp } from "@/lib/bookmarkApi";
import type { Marker } from "@/lib/markerApi";
import { framingStyle, thumbnailUrl, type MediaItemDetail } from "@/lib/mediaItemApi";
import { cn } from "@/lib/utils";

/**
 * The playing video, small: frames copied from the player itself as they
 * come, so it is the same picture in step with it — not a second stream of
 * the file that would cost the bandwidth again and drift out of sync.
 * Copies only while shown; the thumbnail sits beneath until a frame lands.
 */
function LiveFrame({
  item,
  videoRef,
  active,
}: {
  item: MediaItemDetail;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let stopped = false;
    let frame = 0;
    let lastTime = -1;

    // Reads the player's element afresh every frame: it is swapped for a new
    // one when playback starts, and a callback tied to the old one would
    // simply stop. Redraws only when the picture has moved on.
    const loop = () => {
      if (stopped) return;
      frame = requestAnimationFrame(loop);
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.currentTime === lastTime) return;
      lastTime = video.currentTime;
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        setDrawn(true);
      } catch {
        // A stream the canvas may not read (a cast session): the still stays.
      }
    };
    frame = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [active, videoRef]);

  return (
    <span className="relative block aspect-video h-10 shrink-0 overflow-hidden rounded-md bg-black ring-1 ring-white/10">
      <img
        src={thumbnailUrl(item)}
        alt=""
        style={framingStyle(item)}
        className={cn("sensitive size-full object-cover transition-opacity duration-300", drawn && "opacity-0")}
      />
      {/* Drawn at twice its shown size, so it stays crisp on a sharp screen. */}
      <canvas ref={canvasRef} width={142} height={80} className="discreet-exempt absolute inset-0 size-full object-contain" />
    </span>
  );
}

/**
 * Now-playing controls in the middle of the header, once the player has
 * scrolled out of view: play/pause, the still, the title, the time and how
 * far through — so the video can be controlled while reading its details or
 * choosing what's next. Clicking the title returns to the player.
 *
 * Part of the top bar rather than a second bar under it, so scrolling down
 * never stacks two strips over the page.
 */
export function CompactPlayerBar({
  item,
  videoRef,
  visible,
  markers = [],
  playing,
  currentTime,
  duration,
  onTogglePlay,
  onBackToVideo,
}: {
  item: MediaItemDetail;
  /** The player's own video, whose frames are shown small here. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  visible: boolean;
  /** The video's chapters, marked along the progress line. */
  markers?: Marker[];
  playing: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onBackToVideo: () => void;
}) {
  // The line split into one segment per chapter (or a single one without),
  // each filled as far as playback has got through it.
  const starts = [...markers]
    .map((marker) => marker.startSeconds)
    .filter((start) => duration > 0 && start > 0 && start < duration)
    .sort((a, b) => a - b);
  const bounds = [0, ...starts, duration];
  const segments = duration > 0
    ? bounds.slice(0, -1).map((start, index) => {
        const end = bounds[index + 1];
        const fill = Math.min(1, Math.max(0, (currentTime - start) / Math.max(1, end - start)));
        return { start, width: ((end - start) / duration) * 100, fill: fill * 100 };
      })
    : [{ start: 0, width: 100, fill: 0 }];
  const chapter = [...markers]
    .sort((a, b) => a.startSeconds - b.startSeconds)
    .filter((marker) => marker.startSeconds <= currentTime + 0.5)
    .pop();
  return (
    <HeaderStart>
      <div
        aria-hidden={!visible}
        className={cn(
          "flex w-full min-w-0 max-w-2xl items-center gap-3 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          visible ? "translate-y-0 opacity-100" : "!pointer-events-none -translate-y-1.5 opacity-0",
        )}
      >
        <button
          type="button"
          onClick={onTogglePlay}
          tabIndex={visible ? 0 : -1}
          aria-label={playing ? "Pause" : "Play"}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105"
        >
          {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 translate-x-px fill-current" />}
        </button>
        <button
          type="button"
          onClick={onBackToVideo}
          tabIndex={visible ? 0 : -1}
          title="Back to the video"
          className="group flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <LiveFrame item={item} videoRef={videoRef} active={visible} />
          <span className="min-w-0 flex-1">
            <span className="sensitive block truncate text-sm font-semibold text-white group-hover:underline">
              {item.title}
            </span>
            <span className="mt-1 flex items-center gap-2">
              <span className="flex h-1 min-w-16 flex-1 gap-[3px]">
                {segments.map((segment) => (
                  <span
                    key={segment.start}
                    className="h-full overflow-hidden rounded-full bg-white/15"
                    style={{ width: `${segment.width}%` }}
                  >
                    <span
                      className="block h-full bg-primary transition-[width] duration-500"
                      style={{ width: `${segment.fill}%` }}
                    />
                  </span>
                ))}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">
                {formatTimestamp(currentTime)}
                {duration > 0 && ` / ${formatTimestamp(duration)}`}
              </span>
              {chapter && (
                <span className="max-w-40 truncate text-[11px] font-medium text-zinc-300" title={chapter.title}>
                  · {chapter.title}
                </span>
              )}
            </span>
          </span>
        </button>
      </div>
    </HeaderStart>
  );
}
