import { useRef } from "react";
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
      void savePlaybackPosition(item.id, Math.floor(video.currentTime));
    }
  }

  function handlePause() {
    const video = videoRef.current;
    if (!item || !video || mode !== "playing") return;
    void savePlaybackPosition(item.id, Math.floor(video.currentTime));
  }

  return { lastSavedAt, handleTimeUpdate, handlePause };
}
