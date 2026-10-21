import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

type CastLink = { url: string; lanReachable: boolean };

/** Safari's AirPlay additions to <video>, which TypeScript's DOM types lack. */
type AirPlayVideo = HTMLVideoElement & {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
};

/**
 * Whether the page is one where the TV fetches the URL itself.
 *
 * Desktop Chrome casts by streaming from the browser (media remoting), so the
 * page's own localhost URL is fine and swapping it would only interrupt
 * playback for nothing. Android Chrome and AirPlay hand the TV the URL, so
 * there it has to be one the TV can reach and is allowed to fetch.
 */
function tvFetchesUrl(video: HTMLVideoElement): boolean {
  if ((video as AirPlayVideo).webkitShowPlaybackTargetPicker) return true;
  return /Android/i.test(navigator.userAgent);
}

/**
 * Casting the player's video to a TV: Chromecast through the Remote Playback
 * API, AirPlay through Safari's picker.
 *
 * `available` is true only once the browser reports a device on the network,
 * so the button is not drawn in a house with nothing to cast to. The cast
 * link is fetched as soon as it is, because opening the device picker has to
 * happen inside the click — a network round trip first can outlast the
 * browser's patience for a "user gesture" and the picker silently never opens.
 *
 * `prepare` swaps the element onto the cast link where the TV needs it,
 * keeping the current position; the caller owns the element's `src`, so this
 * hands back the URL rather than setting it.
 */
export function useCast(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  itemId: number,
  active: boolean,
  /** Changes whenever the <video> element is replaced, so listeners re-attach. */
  elementKey: string,
) {
  const [available, setAvailable] = useState(false);
  const [casting, setCasting] = useState(false);

  useEffect(() => {
    const video = videoRef.current as AirPlayVideo | null;
    setAvailable(false);
    setCasting(false);
    if (!active || !video) return;

    const remote = video.remote;
    if (remote && typeof remote.watchAvailability === "function") {
      let watchId: number | undefined;
      // The id arrives asynchronously, so cleanup can run before it does.
      // Without this the late id would be stored on a dead closure and the
      // watch — and its callback into this unmounted hook — never cancelled.
      let cancelled = false;
      remote
        .watchAvailability((isAvailable) => {
          if (!cancelled) setAvailable(isAvailable);
        })
        .then((id) => {
          if (cancelled) void remote.cancelWatchAvailability(id).catch(() => {});
          else watchId = id;
        })
        // Refused where the platform cannot cast at all; the button stays away.
        .catch(() => {
          if (!cancelled) setAvailable(false);
        });
      const onState = () => setCasting(remote.state !== "disconnected");
      remote.addEventListener("connect", onState);
      remote.addEventListener("connecting", onState);
      remote.addEventListener("disconnect", onState);
      return () => {
        cancelled = true;
        if (watchId !== undefined) void remote.cancelWatchAvailability(watchId).catch(() => {});
        remote.removeEventListener("connect", onState);
        remote.removeEventListener("connecting", onState);
        remote.removeEventListener("disconnect", onState);
      };
    }

    if (video.webkitShowPlaybackTargetPicker) {
      const onAvailability = (event: Event) =>
        setAvailable((event as Event & { availability?: string }).availability === "available");
      const onWireless = () => setCasting(Boolean(video.webkitCurrentPlaybackTargetIsWireless));
      video.addEventListener("webkitplaybacktargetavailabilitychanged", onAvailability);
      video.addEventListener("webkitcurrentplaybacktargetiswirelesschanged", onWireless);
      return () => {
        video.removeEventListener("webkitplaybacktargetavailabilitychanged", onAvailability);
        video.removeEventListener("webkitcurrentplaybacktargetiswirelesschanged", onWireless);
      };
    }
  }, [active, videoRef, elementKey]);

  const { data: link } = useQuery({
    queryKey: ["cast-link", itemId],
    queryFn: async (): Promise<CastLink> => {
      const res = await fetch(`/api/media-items/${itemId}/cast`);
      if (!res.ok) throw new Error(`Could not make a cast link: ${res.status}`);
      return res.json();
    },
    enabled: active && available,
    // The token lasts six hours; refreshing well inside that keeps a link
    // taken from the cache from being a stale one.
    staleTime: 60 * 60 * 1000,
  });

  /**
   * The URL the element should play from while casting, or null to leave it
   * alone. Only differs from the ordinary stream where the TV fetches it.
   */
  function castSource(): string | null {
    const video = videoRef.current;
    if (!video || !link?.lanReachable) return null;
    return tvFetchesUrl(video) ? link.url : null;
  }

  /** Opens the browser's device picker. Must run inside the click handler. */
  function openPicker(): Promise<void> {
    const video = videoRef.current as AirPlayVideo | null;
    if (!video) return Promise.resolve();
    if (video.remote && typeof video.remote.prompt === "function") {
      // Rejects when the picker is dismissed, which is not an error.
      return video.remote.prompt().catch(() => {});
    }
    video.webkitShowPlaybackTargetPicker?.();
    return Promise.resolve();
  }

  return { available, casting, castSource, openPicker, lanReachable: link?.lanReachable ?? null };
}
