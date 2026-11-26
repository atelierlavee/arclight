// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { Maximize, Minimize, Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react";
import { formatTimestamp } from "@/lib/bookmarkApi";
import { cn } from "@/lib/utils";

/**
 * The bar along the bottom of the frame during playback: play/pause, the
 * time, volume, and fullscreen.
 *
 * In place of the browser's own control bar, which brought a second
 * fullscreen button: it took the bare <video> fullscreen and left every
 * overlay (seek previews, X-Ray, skip buttons) behind, and once the player
 * area was fullscreen it showed "exit" and did the wrong thing. One bar, one
 * fullscreen — the player area's.
 */
export function PlayerBar({
  videoRef,
  visible,
  currentTime,
  duration,
  besidePanel = false,
  onTogglePlay,
  onToggleMuted,
  onToggleFullscreen,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  visible: boolean;
  currentTime: number;
  duration: number;
  /** Narrowed to stay clear of the queue panel floating over the frame. */
  besidePanel?: boolean;
  onTogglePlay: () => void;
  onToggleMuted: () => void;
  onToggleFullscreen: () => void;
}) {
  const [paused, setPaused] = useState(true);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));

  // The element is the source of truth; this only mirrors it, so the
  // keyboard shortcuts and the bar can never disagree.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      setPaused(video.paused);
      setVolume(video.volume);
      setMuted(video.muted);
    };
    sync();
    const events = ["play", "pause", "volumechange", "loadedmetadata"] as const;
    events.forEach((name) => video.addEventListener(name, sync));
    return () => events.forEach((name) => video.removeEventListener(name, sync));
  }, [videoRef]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function setLevel(next: number) {
    const video = videoRef.current;
    if (!video) return;
    video.volume = next;
    // Dragging the slider up on a muted video should actually be heard.
    if (next > 0 && video.muted) video.muted = false;
  }

  const silent = muted || volume === 0;
  const VolumeIcon = silent ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const button =
    "flex size-10 shrink-0 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 hover:text-white";

  return (
    <div
      className={cn(
        "absolute bottom-0 left-0 z-20 flex h-14 items-center gap-1 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-2 transition-opacity duration-300",
        besidePanel ? "right-[20rem]" : "right-0",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <button type="button" onClick={onTogglePlay} aria-label={paused ? "Play" : "Pause"} title={paused ? "Play (k)" : "Pause (k)"} className={button}>
        {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
      </button>

      <div className="group/volume flex items-center">
        <button type="button" onClick={onToggleMuted} aria-label={silent ? "Unmute" : "Mute"} title={silent ? "Unmute (m)" : "Mute (m)"} className={button}>
          <VolumeIcon className="size-5" />
        </button>
        {/* Opens out on hover or focus, like most players. */}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={silent ? 0 : volume}
          onChange={(event) => setLevel(Number(event.target.value))}
          aria-label="Volume"
          className="h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/30 accent-white opacity-0 transition-all duration-200 group-hover/volume:mr-2 group-hover/volume:w-20 group-hover/volume:opacity-100 focus-visible:mr-2 focus-visible:w-20 focus-visible:opacity-100"
        />
      </div>

      <span className="ml-1 text-[13px] font-medium tabular-nums text-white/90">
        {formatTimestamp(currentTime)}
        {Number.isFinite(duration) && duration > 0 && (
          <span className="text-white/55"> / {formatTimestamp(duration)}</span>
        )}
      </span>

      <button
        type="button"
        onClick={onToggleFullscreen}
        aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        title={fullscreen ? "Exit fullscreen (f)" : "Fullscreen (f)"}
        className={cn(button, "ml-auto")}
      >
        {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
      </button>
    </div>
  );
}
