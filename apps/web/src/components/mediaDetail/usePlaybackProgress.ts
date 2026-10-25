import { useEffect, useRef } from "react";
import { savePlaybackPosition, type MediaItemDetail } from "@/lib/mediaItemApi";
import { SAVE_INTERVAL_MS } from "./playerUtils";

/** Saves the resume position as real playback runs, throttled, and on pause. */
export function usePlaybackProgress({
  videoRef,
  item,
  mode,
  setCurrentTime,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  item: MediaItemDetail | undefined;
  mode: "preview" | "playing";
  setCurrentTime: (seconds: number) => void;
}) {
  const lastSavedAt = useRef(0);
  // The latest real position and whether it has been saved. Kept in a ref
  // because the video element is already detached by the time unmount
  // cleanup runs, so its currentTime can no longer be read there.
  const pending = useRef<{ id: number; seconds: number } | null>(null);
  const itemId = item?.id;

  // Progress is otherwise saved only every few seconds and on pause. Closing
  // the player or the tab mid-play fires neither, so up to a throttle
  // interval of progress would be lost and Resume would land behind.
  useEffect(() => {
    const flush = () => {
      const unsaved = pending.current;
      if (!unsaved) return;
      pending.current = null;
      void savePlaybackPosition(unsaved.id, unsaved.seconds).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [itemId]);

  function handleTimeUpdate() {
    const video = videoRef.current;
    // Critical: only real playback counts as progress. Saving during the
    // muted background preview would clobber the actual resume position
    // with wherever the preview happens to be.
    if (!video || !item || mode !== "playing") return;
    setCurrentTime(video.currentTime);

    const now = Date.now();
    if (now - lastSavedAt.current > SAVE_INTERVAL_MS) {
      lastSavedAt.current = now;
      pending.current = null;
      void savePlaybackPosition(item.id, Math.floor(video.currentTime));
    } else {
      pending.current = { id: item.id, seconds: Math.floor(video.currentTime) };
    }
  }

  function handlePause() {
    const video = videoRef.current;
    if (!item || !video || mode !== "playing") return;
    pending.current = null;
    void savePlaybackPosition(item.id, Math.floor(video.currentTime));
  }

  return { lastSavedAt, handleTimeUpdate, handlePause };
}
