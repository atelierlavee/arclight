import { useEffect, useLayoutEffect, useRef } from "react";
import { isDigitKey, isTypingTarget } from "./playerUtils";

export type PlayerKeyboardOptions = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mode: "preview" | "playing";
  mini: boolean;
  cinema: boolean;
  isVideo: boolean;
  queueOpen: boolean;
  skipSeconds: React.RefObject<number>;
  onClose: () => void;
  setCinema: React.Dispatch<React.SetStateAction<boolean>>;
  setQueueChoice: (open: boolean) => void;
  togglePlay: () => void;
  skip: (seconds: number) => void;
  nudgeVolume: (delta: number) => void;
  toggleFullscreen: () => void;
  toggleMuted: () => void;
  togglePictureInPicture: () => Promise<void>;
  addBookmark: () => void;
  jumpToBestPart: () => void;
  seekTo: (seconds: number) => void;
};

/** The player's keyboard shortcuts, listened for on the window. */
export function usePlayerKeyboard(options: PlayerKeyboardOptions) {
  // The handler is rebuilt every render and read through a ref, so it always
  // sees the current mode, item and callbacks — a dependency list here kept
  // missing one and replaying a stale closure. Only the listener is stable.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  useLayoutEffect(() => {
    const {
      videoRef,
      mode,
      mini,
      cinema,
      isVideo,
      queueOpen,
      skipSeconds,
      onClose,
      setCinema,
      setQueueChoice,
      togglePlay,
      skip,
      nudgeVolume,
      toggleFullscreen,
      toggleMuted,
      togglePictureInPicture,
      addBookmark,
      jumpToBestPart,
      seekTo,
    } = options;
    keyHandler.current = (e: KeyboardEvent) => {
      // Escape closes even from inside an input — it's the way out of a
      // field you opened by accident.
      if (e.key === "Escape") {
        if (cinema) {
          setCinema(false);
          return;
        }
        onClose();
        return;
      }
      if (isTypingTarget(e.target)) return;

      // Handled above the guard below because the queue is worth seeing while
      // the preview is still running — that is when you are deciding what to
      // line up next, not once something is already playing.
      if (e.key === "q" || e.key === "Q") {
        if (!mini && !cinema && isVideo) {
          e.preventDefault();
          setQueueChoice(!queueOpen);
        }
        return;
      }

      // Every shortcut below drives the video, so there's nothing to do
      // while the muted preview is showing.
      if (mode !== "playing") return;

      // The browser's own controls already handle arrows and space once the
      // video itself has focus. Handling them again here would seek twice
      // per press.
      // The browser's own controls handle arrows and space once the video has
      // focus; these keys have no native binding, so they still have to reach
      // this handler from there.
      if (
        e.target === videoRef.current &&
        e.key !== "f" &&
        e.key !== "m" &&
        e.key !== "c" &&
        e.key !== "i" &&
        e.key !== "b" &&
        e.key !== "h" &&
        !isDigitKey(e.key)
      )
        return;

      switch (e.key) {
        case " ":
        case "k":
          // Space also scrolls this modal's overflow container and re-clicks
          // whichever button was last focused — the modal is full of them.
          e.preventDefault();
          if (e.target instanceof HTMLElement) e.target.blur();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          skip(-skipSeconds.current);
          break;
        case "ArrowRight":
          e.preventDefault();
          skip(skipSeconds.current);
          break;
        case "ArrowUp":
          e.preventDefault();
          nudgeVolume(0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          nudgeVolume(-0.1);
          break;
        case "f":
          toggleFullscreen();
          break;
        case "m":
          toggleMuted();
          break;
        case "c":
          if (!mini) setCinema((active) => !active);
          break;
        case "i":
          void togglePictureInPicture();
          break;
        case "b":
          addBookmark();
          break;
        case "h":
          jumpToBestPart();
          break;
        default:
          // 0–9 jump to that tenth of the video, as on YouTube: 5 is
          // halfway, 0 is the start. Read from the element rather than the
          // item, since the element's duration is what a seek is bounded by.
          if (isDigitKey(e.key)) {
            const video = videoRef.current;
            const duration = video?.duration;
            if (video && duration && Number.isFinite(duration)) {
              e.preventDefault();
              seekTo((Number(e.key) / 10) * duration);
            }
          }
          break;
      }
    };
  });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
