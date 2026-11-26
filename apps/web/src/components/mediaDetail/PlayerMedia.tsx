// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import type Hls from "hls.js";
import { framingStyle, thumbnailUrl, type MediaItemDetail } from "@/lib/mediaItemApi";
import { cn } from "@/lib/utils";
import type { SubtitleTrack } from "./useSubtitles";

/** What fills the player frame: the poster and <video> for a video, the image for a photo. */
export function PlayerMedia({
  item,
  videoRef,
  mode,
  mini,
  seeked,
  stillOnly,
  castSrc,
  subtitleTracks,
  onLoadedMetadata,
  onSeeked,
  onTimeUpdate,
  onPause,
  onEnded,
  onVolumeChange,
  onVideoClick,
  onVideoDoubleClick,
}: {
  item: MediaItemDetail | undefined;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mode: "preview" | "playing";
  mini: boolean;
  seeked: boolean;
  stillOnly: boolean;
  castSrc: { id: number; url: string } | null;
  /** Sidecar subtitle files; only attached during real playback. */
  subtitleTracks: SubtitleTrack[];
  onLoadedMetadata: () => void;
  onSeeked: () => void;
  onTimeUpdate: () => void;
  onPause: () => void;
  onEnded: () => void;
  onVolumeChange: () => void;
  /** Clicking the playing video: play/pause, as in most players. */
  onVideoClick?: () => void;
  /** Double-clicking it: the player's own fullscreen. */
  onVideoDoubleClick?: () => void;
}) {
  const [transcodeError, setTranscodeError] = useState<string | null>(null);
  const transcodeRequired =
    mode === "playing" &&
    item?.itemType === "video" &&
    Boolean(item.playbackWarning) &&
    !castSrc;

  // Keyed on the id alone: the item object is replaced whenever its details
  // are refetched (a favourite, a rating, the window regaining focus), and
  // following the object restarted the session — reloading the video and
  // briefly holding two of the server's few transcode slots each time.
  const itemId = item?.id;
  useEffect(() => {
    if (!transcodeRequired || itemId === undefined) return;

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let sessionId: string | null = null;
    let hls: Hls | null = null;

    const stopSession = async (id: string) => {
      try {
        await fetch(`/api/transcodes/${id}`, {
          method: "DELETE",
          keepalive: true,
        });
      } catch (error) {
        console.warn("transcode: could not stop playback session:", error);
      }
    };

    const start = async () => {
      setTranscodeError(null);
      const nativeHls = Boolean(video.canPlayType("application/vnd.apple.mpegurl"));
      let HlsPlayer: typeof import("hls.js").default | null = null;
      if (!nativeHls) {
        HlsPlayer = (await import("hls.js")).default;
        if (!HlsPlayer.isSupported()) {
          setTranscodeError("This browser does not support the transcoded video stream.");
          return;
        }
      }

      const response = await fetch(`/api/media-items/${itemId}/transcodes`, {
        method: "POST",
      });
      const body = (await response.json()) as {
        sessionId?: unknown;
        error?: unknown;
      };
      if (!response.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : `Request failed (${response.status})`,
        );
      }
      if (typeof body.sessionId !== "string") {
        throw new Error("The server did not create a transcode session");
      }

      sessionId = body.sessionId;
      if (cancelled) {
        await stopSession(sessionId);
        return;
      }

      const source = `/api/transcodes/${sessionId}/index.m3u8`;
      if (nativeHls) {
        video.src = source;
        video.load();
        void video.play().catch(() => {});
      } else {
        if (!HlsPlayer) throw new Error("HLS playback is unavailable");
        hls = new HlsPlayer();
        hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setTranscodeError("The video could not be transcoded for playback.");
            if (sessionId) void stopSession(sessionId);
          }
        });
        hls.on(HlsPlayer.Events.MANIFEST_PARSED, () => {
          void video.play().catch(() => {});
        });
        hls.loadSource(source);
        hls.attachMedia(video);
      }
    };

    // Unmounting doesn't happen when the page itself goes away — a reload or a
    // closed tab — so the session is let go here too, or it would hold its
    // slot until the server's idle timeout.
    const onPageHide = () => {
      if (sessionId) void stopSession(sessionId);
    };
    window.addEventListener("pagehide", onPageHide);

    void start().catch((error: unknown) => {
      if (!cancelled) {
        setTranscodeError(
          error instanceof Error ? error.message : "The video could not be transcoded.",
        );
      }
    });

    return () => {
      cancelled = true;
      hls?.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
      window.removeEventListener("pagehide", onPageHide);
      if (sessionId) void stopSession(sessionId);
    };
  }, [itemId, transcodeRequired, videoRef]);

  return (
    <>
      {item?.itemType === "video" && (
        <img
          src={thumbnailUrl(item)}
          alt=""
          // Fades out once real playback is actually on screen. It fills
          // the frame (object-cover) while the video letterboxes inside it
          // (object-contain), so for anything not exactly 16:9 the poster
          // stayed visible down the sides — a bright one reads as a white
          // border rather than as bars. Kept until the seek lands, which
          // is what stops the frame flashing black while the stream
          // buffers.
          style={{
            ...framingStyle(item),
            opacity: mode === "playing" && seeked ? 0 : 1,
            transition: "opacity 300ms ease-out",
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {item?.itemType === "video" ? (
        <video
          ref={videoRef}
          // Preview mode plays the pre-cut clip (instant, already at the
          // poster frame); real playback streams the full file.
          key={mode}
          // With no clip to run, the element is left holding its poster.
          // Two reasons to end up here: discreet mode, where blurred
          // motion still reads as motion across a room, and the
          // appearance panel's "Play preview when opened" turned off.
          src={
            mode === "playing"
              ? transcodeRequired
                ? undefined
                : castSrc?.id === item.id
                ? castSrc.url
                : `/api/stream/${item.id}`
              : stillOnly
                ? undefined
                : `/api/media-items/${item.id}/preview`
          }
          poster={thumbnailUrl(item)}
          onLoadedMetadata={onLoadedMetadata}
          onSeeked={onSeeked}
          onTimeUpdate={onTimeUpdate}
          onPause={onPause}
          onEnded={onEnded}
          onVolumeChange={onVolumeChange}
          muted={mode === "preview"}
          autoPlay={mode === "playing" || !stillOnly}
          loop={mode === "preview"}
          playsInline
          // Only the mini player keeps the browser's bar; elsewhere the
          // player draws its own (PlayerBar), with the one fullscreen that
          // keeps its overlays.
          controls={mode === "playing" && mini}
          onClick={mode === "playing" && !mini ? onVideoClick : undefined}
          onDoubleClick={mode === "playing" && !mini ? onVideoDoubleClick : undefined}
          controlsList={mini ? "nofullscreen" : undefined}
          style={{
            // Nothing will ever seek when there is no clip loaded, so
            // the still has to be shown outright or the fade-in would
            // leave the frame blank.
            opacity: seeked || stillOnly ? 1 : 0,
            transition: "opacity 300ms ease-out",
          }}
          className={cn(
            "absolute inset-0 h-full w-full",
            // The preview is deliberately cropped to fill the frame, but
            // cropping actual playback cuts the sides off anything that
            // isn't 16:9 — letterbox it instead.
            mode === "playing" ? "object-contain" : "object-cover",
            // Discreet mode blurs every image and clip in the app, but
            // blurring something you deliberately pressed play on would
            // just be broken.
            mode === "playing" && "discreet-exempt",
            // SeekStrip replaces the native timeline; see index.css.
            mode === "playing" && !mini && "custom-seek",
          )}
        >
          {mode === "playing" &&
            subtitleTracks.map((track) => (
              <track
                key={track.index}
                kind="subtitles"
                src={`/api/media-items/${item.id}/subtitles/${track.index}`}
                srcLang={track.language ?? undefined}
                label={track.label}
              />
            ))}
        </video>
      ) : item ? (
        <img
          src={`/api/stream/${item.id}`}
          alt={item.title}
          className="h-full w-full object-contain"
        />
      ) : null}
      {transcodeError && (
        <div
          role="alert"
          className="absolute inset-x-4 bottom-16 z-20 rounded-lg bg-black/85 p-4 text-sm text-white"
        >
          {transcodeError}
        </div>
      )}
    </>
  );
}
