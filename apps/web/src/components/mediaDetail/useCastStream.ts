import { useState } from "react";
import type { MediaItemDetail } from "@/lib/mediaItemApi";
import { useCast } from "@/lib/useCast";

/** Casting to a TV, and the stream URL the player switches to while it does. */
export function useCastStream({
  videoRef,
  item,
  viewingId,
  mode,
  setStartPosition,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  item: MediaItemDetail | undefined;
  viewingId: number;
  mode: "preview" | "playing";
  /** Where real playback picks up once the element reloads its source. */
  setStartPosition: (seconds: number) => void;
}) {
  const isVideo = item?.itemType === "video";
  const cast = useCast(videoRef, viewingId, isVideo && mode === "playing", `${mode}-${viewingId}`);
  // The stream this item is playing from while it is being cast, when the TV
  // needed a different URL from the ordinary one. Keyed by item so opening
  // another video goes back to the ordinary stream without a reset.
  const [castSrc, setCastSrc] = useState<{ id: number; url: string } | null>(null);

  /**
   * Hands the video to a TV. Everything here stays synchronous up to the
   * picker, which only opens from inside the click itself.
   */
  function startCasting() {
    const video = videoRef.current;
    if (!video || !item) return;
    const url = cast.castSource();
    if (url && castSrc?.url !== url) {
      // Carried across the swap by handleLoadedMetadata, like a resume.
      setStartPosition(video.currentTime);
      video.src = url;
      setCastSrc({ id: item.id, url });
      void video.play().catch(() => {});
    }
    void cast.openPicker();
  }

  return { cast, castSrc, setCastSrc, startCasting };
}
