import { useEffect, useRef, useState } from "react";
import type { MediaItemDetail } from "@/lib/mediaItemApi";
import {
  readRate,
  readSkipSeconds,
  readVolume,
  writeRate,
  writeSkipSeconds,
  writeVolume,
} from "@/lib/playerPrefs";
import { MIN_RESUMABLE_SECONDS } from "./playerUtils";

export type PlayerMode = "preview" | "playing";

/**
 * The <video> element's playback: starting it, seeking, volume, speed and the
 * skip interval, plus the element events that keep React in step with it.
 */
export function useVideoPlayback({
  videoRef,
  item,
  mode,
  setMode,
  revealPlayerControls,
  autoPlay,
  resume,
  itemId,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  item: MediaItemDetail | undefined;
  mode: PlayerMode;
  setMode: (mode: PlayerMode) => void;
  revealPlayerControls: () => void;
  autoPlay: boolean;
  resume: boolean;
  /** The item the modal was asked to show, which autoPlay and resume apply to. */
  itemId: number;
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [seeked, setSeeked] = useState(false);
  const [muted, setMuted] = useState(true);
  // Read once on mount rather than on every render — these are re-applied to
  // the element imperatively, so React never needs to re-render for them.
  const [rate, setRate] = useState(readRate);
  const [showRates, setShowRates] = useState(false);
  const [showSkipOptions, setShowSkipOptions] = useState(false);
  const volumeRef = useRef(readVolume());
  /** How far the arrow keys and the skip buttons jump — read from prefs. */
  const skipSeconds = useRef(readSkipSeconds());
  const startPosition = useRef(0);
  const autoPlayTriggered = useRef(false);

  function skip(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    const limit = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.min(
      limit,
      Math.max(0, video.currentTime + seconds),
    );
  }

  function seekTo(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    setCurrentTime(seconds);
    revealPlayerControls();
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  }

  function applyRate(next: number) {
    setRate(next);
    writeRate(next);
    setShowRates(false);
    if (videoRef.current) videoRef.current.playbackRate = next;
  }

  function applySkipSeconds(next: number) {
    skipSeconds.current = next;
    writeSkipSeconds(next);
    setShowSkipOptions(false);
  }

  function nudgeVolume(delta: number) {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.min(1, Math.max(0, video.volume + delta));
    video.volume = next;
    volumeRef.current = next;
    writeVolume(next);
    // Raising the volume on a muted video should actually be audible.
    if (next > 0 && video.muted) {
      video.muted = false;
      setMuted(false);
    }
  }

  function toggleMuted() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  function startPlaying(positionSeconds: number) {
    startPosition.current = positionSeconds;
    setMode("playing");
    setMuted(false);

    const video = videoRef.current;
    if (video) {
      video.currentTime = positionSeconds;
      video.muted = false;
      void video.play().catch(() => {});
    }
  }

  // Hero "Play" arrives with autoPlay set — skip the muted preview entirely.
  useEffect(() => {
    if (
      autoPlay &&
      item?.itemType === "video" &&
      // The requested item, not whatever was showing when the request
      // arrived: a new one is still loading for a render or two.
      item.id === itemId &&
      !autoPlayTriggered.current
    ) {
      autoPlayTriggered.current = true;
      startPlaying(
        resume && item.lastPositionSeconds > MIN_RESUMABLE_SECONDS
          ? item.lastPositionSeconds
          : 0,
      );
    }
    // startPlaying is rebuilt every render; only these inputs should run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, item, itemId, resume]);

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video || !item) return;

    // `key={mode}` mounts a brand-new element when the preview gives way to
    // real playback, so anything set imperatively is gone by this point.
    // Re-applying here is what makes volume and speed survive that swap —
    // and carry over to the next video you open.
    video.volume = volumeRef.current;
    video.playbackRate = rate;

    // The preview clip already starts where it should, so only real playback
    // needs to seek (and stays hidden until that seek lands).
    if (mode === "playing") {
      video.currentTime = startPosition.current;
      return; // revealed by onSeeked
    }
    setSeeked(true);
  }

  // The native controls have their own volume slider, so the element is the
  // source of truth — this just records what it settles on.
  function handleVolumeChange() {
    const video = videoRef.current;
    if (!video || mode !== "playing") return;
    if (video.volume !== volumeRef.current) {
      volumeRef.current = video.volume;
      writeVolume(video.volume);
    }
    setMuted(video.muted);
  }

  return {
    currentTime,
    setCurrentTime,
    seeked,
    setSeeked,
    muted,
    setMuted,
    rate,
    showRates,
    setShowRates,
    showSkipOptions,
    setShowSkipOptions,
    skipSeconds,
    startPosition,
    autoPlayTriggered,
    skip,
    seekTo,
    togglePlay,
    applyRate,
    applySkipSeconds,
    nudgeVolume,
    toggleMuted,
    startPlaying,
    handleLoadedMetadata,
    handleVolumeChange,
  };
}
