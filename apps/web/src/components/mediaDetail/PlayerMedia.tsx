import { framingStyle, thumbnailUrl, type MediaItemDetail } from "@/lib/mediaItemApi";
import { cn } from "@/lib/utils";

/** What fills the player frame: the poster and <video> for a video, the image for a photo. */
export function PlayerMedia({
  item,
  videoRef,
  mode,
  mini,
  seeked,
  stillOnly,
  castSrc,
  onLoadedMetadata,
  onSeeked,
  onTimeUpdate,
  onPause,
  onEnded,
  onVolumeChange,
}: {
  item: MediaItemDetail | undefined;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mode: "preview" | "playing";
  mini: boolean;
  seeked: boolean;
  stillOnly: boolean;
  castSrc: { id: number; url: string } | null;
  onLoadedMetadata: () => void;
  onSeeked: () => void;
  onTimeUpdate: () => void;
  onPause: () => void;
  onEnded: () => void;
  onVolumeChange: () => void;
}) {
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
        // eslint-disable-next-line jsx-a11y/media-has-caption -- no sidecar subtitles yet
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
              ? castSrc?.id === item.id
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
          controls={mode === "playing"}
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
        />
      ) : item ? (
        <img
          src={`/api/stream/${item.id}`}
          alt={item.title}
          className="h-full w-full object-contain"
        />
      ) : null}
    </>
  );
}
