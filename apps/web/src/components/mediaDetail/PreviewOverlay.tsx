// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { Play, Volume2, VolumeX } from "lucide-react";
import type { MediaItemDetail } from "@/lib/mediaItemApi";
import { formatTimestamp } from "@/lib/bookmarkApi";

/**
 * What sits over the still before playback: one play button in the middle,
 * where you left off in the corner, how far through along the bottom edge,
 * and mute. The title and every other action are under the video.
 */
export function PreviewOverlay({
  item,
  canResume,
  muted,
  progressPercent,
  onStartPlaying,
  onToggleMuted,
}: {
  item: MediaItemDetail | undefined;
  canResume: boolean;
  muted: boolean;
  /** How far through, 0–100, drawn along the frame's bottom edge. */
  progressPercent: number;
  onStartPlaying: (positionSeconds: number) => void;
  onToggleMuted: () => void;
}) {
  if (item?.itemType !== "video") return null;
  const resumeAt = item.lastPositionSeconds;
  return (
    <>
      {/* Just enough shade for the white controls to read on a bright frame. */}
      <div className="pointer-events-none absolute inset-0 bg-black/15" />

      <button
        type="button"
        onClick={() => onStartPlaying(canResume ? resumeAt : 0)}
        aria-label={canResume ? `Resume from ${formatTimestamp(resumeAt)}` : "Play"}
        className="group absolute inset-0 z-20 flex items-center justify-center"
      >
        <span className="flex size-16 items-center justify-center rounded-full bg-white text-black shadow-[0_10px_40px_rgba(0,0,0,0.5)] transition-transform duration-200 group-hover:scale-105 group-active:scale-95 md:size-[76px]">
          <Play className="size-7 translate-x-0.5 fill-current" />
        </span>
      </button>

      {canResume && (
        <span className="pointer-events-none absolute bottom-5 left-5 z-20 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
          Resume from {formatTimestamp(resumeAt)}
        </span>
      )}

      <button
        type="button"
        onClick={onToggleMuted}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute bottom-4 right-4 z-30 flex size-9 items-center justify-center rounded-full bg-black/55 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/75 hover:text-white"
      >
        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </button>

      {canResume && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-1 bg-white/15">
          <div className="h-full bg-primary" style={{ width: `${progressPercent}%` }} />
        </div>
      )}
    </>
  );
}
