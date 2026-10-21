import { useEffect, useState } from "react";

/**
 * The ways the player can take over more of the screen: cinema mode,
 * Picture-in-Picture and fullscreen.
 */
export function useScreenModes({
  videoRef,
  playerAreaRef,
  isMobile,
  mini,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playerAreaRef: React.RefObject<HTMLDivElement | null>;
  isMobile: boolean;
  mini: boolean;
}) {
  const [cinema, setCinema] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (cinema && !mini) root.setAttribute("data-cinema", "true");
    else root.removeAttribute("data-cinema");
    return () => root.removeAttribute("data-cinema");
  }, [cinema, mini]);

  /**
   * Picture-in-Picture (§10).
   *
   * Distinct from the mini player, which is this app's own floating window
   * and only survives while the tab is open. PiP is the browser's, so it
   * keeps playing over other applications and outlives navigating away —
   * which is the reason to offer both rather than treating one as the other.
   *
   * Guarded on support rather than assumed: Firefox exposes the API only
   * behind its own UI, and calling it there throws rather than no-opping.
   */
  const pipSupported =
    typeof document !== "undefined" &&
    "pictureInPictureEnabled" in document &&
    document.pictureInPictureEnabled;

  async function togglePictureInPicture() {
    const video = videoRef.current;
    if (!video || !pipSupported) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      // Denied by the browser (no user gesture, or disabled by policy).
      // There is nothing to recover — the video keeps playing where it is.
    }
  }

  /**
   * Fullscreen for the player area rather than the bare <video>.
   *
   * Fullscreening the element itself hides everything drawn over it — the
   * seek preview, bookmarks, skip buttons, the double-tap zones — so the
   * moment you went fullscreen they all stopped existing. The browser's own
   * fullscreen button still takes the video alone, for anyone who wants that.
   *
   * iPhone Safari has no element fullscreen at all, only the video's own
   * native player, so that is the fallback there.
   *
   * On a phone a wide video is also locked to landscape, so it fills the
   * screen without you having to turn it first. Only where the browser
   * allows it (Android, while fullscreen); elsewhere the call just fails.
   */
  function toggleFullscreen() {
    const video = videoRef.current;
    const area = playerAreaRef.current;
    if (!video) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    const target = area?.requestFullscreen ? area : video;
    if (target.requestFullscreen) {
      void target
        .requestFullscreen()
        .then(() => {
          if (isMobile && video.videoWidth > video.videoHeight) {
            const orientation = screen.orientation as ScreenOrientation & {
              lock?: (orientation: string) => Promise<void>;
            };
            return orientation.lock?.("landscape");
          }
        })
        .catch(() => {});
      return;
    }
    (video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
  }

  // Leaving fullscreen by any route — Escape, the system back gesture, the
  // native button — hands orientation back to the phone.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) screen.orientation?.unlock?.();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  return {
    cinema,
    setCinema,
    pipSupported,
    togglePictureInPicture,
    toggleFullscreen,
  };
}
