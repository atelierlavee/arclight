// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { EXPANDED_SCALE, hoverCardBox } from "@/lib/hoverCard";
import { createPortal } from "react-dom";
import { ChevronDown, Check, ListPlus, Play } from "lucide-react";
import { useAppearance } from "@/lib/appearance";
import { framingStyle, thumbnailUrl } from "@/lib/mediaItemApi";
import { cn } from "@/lib/utils";
import type { MediaCardItem } from "./MediaCard";
import { useQueue } from "@/lib/queue";


// Kept in sync with the CSS transition duration below so the element isn't
// unmounted before its exit animation finishes.
const TRANSITION_MS = 280;

// The card animates from exactly the anchor card's rendered size up to full
// size. Starting anywhere above 1/EXPANDED_SCALE means the card pops to a
// visibly larger size on the first frame, which reads as a jump rather than
// a grow.
const START_SCALE = 1 / EXPANDED_SCALE;

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

function resolutionBadge(item: MediaCardItem): string | null {
  const height = item.extraMetadata?.height;
  if (typeof height !== "number") return null;
  if (height >= 2000) return "4K";
  if (height >= 1000) return "HD";
  return "SD";
}

export function HoverPreviewCard({
  item,
  anchorRect,
  onOpen,
  onPlay,
  onDismiss,
  onContextMenu,
}: {
  item: MediaCardItem;
  anchorRect: DOMRect;
  onOpen: (event: React.MouseEvent | React.KeyboardEvent) => void;
  onPlay: (event: React.MouseEvent | React.KeyboardEvent) => void;
  onDismiss: () => void;
  /**
   * Right-click, forwarded to the tile this card grew out of.
   *
   * Without it the card is a hole in the menu: it is portalled to the body,
   * so it is not a descendant of the tile and never sees the tile's handler —
   * and since it covers the tile whenever the pointer is near enough to
   * right-click, the app's menu became unreachable in practice. On a video
   * the browser's own `<video>` menu opened instead, which is how this was
   * found.
   */
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const { hoverPreview, discreet } = useAppearance();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { add, addNext, items: queueItems } = useQueue();
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = queueItems.some((queueItem) => queueItem.id === item.id);

  // Centred on the thumbnail it grew from, and clamped to the window on every
  // side. The maths lives in lib/hoverCard so it can be tested against
  // viewport sizes this component never sees in practice.
  const { left, top, width } = hoverCardBox(anchorRect, {
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Where the anchor card's thumbnail centre falls inside this expanded card.
  const originX = anchorRect.left + anchorRect.width / 2 - left;
  const originY = anchorRect.top + (anchorRect.width * 9) / 16 / 2 - top;

  // Play the grow-in on the frame after mount so the browser has an initial
  // state to transition *from*. Re-runs when the anchor changes, which also
  // cancels any in-flight dismissal — otherwise hovering out and straight
  // back in would let the old timer close the freshly-reopened card.
  useEffect(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [anchorRect]);

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    // Let the shrink-out finish before the element is actually removed.
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(onDismiss, TRANSITION_MS);
  }

  // Any scroll invalidates the anchor position, so dismiss rather than
  // letting the card float somewhere stale.
  useEffect(() => {
    const onScroll = () => dismiss();
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  });

  function handleQueue(e: React.MouseEvent, next: boolean) {
    e.stopPropagation();
    if (item.itemType !== "video") return;
    const queueItem = {
      id: item.id,
      title: item.title,
      thumbnailFile: item.thumbnailFile,
      durationSeconds: item.durationSeconds,
    };
    if (next) addNext(queueItem);
    else add(queueItem);
  }

  const duration = formatDuration(item.durationSeconds);
  const badge = resolutionBadge(item);

  return createPortal(
    <div
      style={{
        left,
        top,
        width,
        // Anchor the growth to where the original thumbnail actually sits
        // inside this card, so it expands out of that card even when the
        // card has been clamped away from centre at a viewport edge.
        transformOrigin: `${originX}px ${originY}px`,
        transform: visible ? "scale(1)" : `scale(${START_SCALE})`,
        opacity: visible ? 1 : 0,
        transition: `transform ${TRANSITION_MS}ms cubic-bezier(0.2, 0, 0, 1), opacity ${TRANSITION_MS}ms ease-out`,
        willChange: "transform, opacity",
      }}
      aria-hidden="true"
      className={cn(
        "fixed z-40 overflow-hidden rounded-lg bg-card shadow-2xl ring-1 ring-white/10",
        !visible && "pointer-events-none",
      )}
      onMouseLeave={dismiss}
      onClick={onOpen}
      onContextMenu={
        // Only where the surface actually has a menu to put there. Swallowing
        // the event unconditionally was worse than the problem it fixed: the
        // rows, Missing and Surprise Me pass no handler, so right-click went
        // from showing the browser's menu to doing nothing at all.
        onContextMenu
          ? (event) => {
              event.preventDefault();
              onContextMenu(event);
            }
          : undefined
      }
    >
      {item.itemType === "video" && hoverPreview && !discreet ? (
        // The thumbnail sits underneath rather than using the video's own
        // `poster`: fading the video in means opacity 0, which would hide a
        // poster attribute too and leave a blank panel.
        <div className="relative aspect-video w-full cursor-pointer overflow-hidden">
          <img
            src={thumbnailUrl(item)}
            alt=""
            style={framingStyle(item)}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- silent hover preview */}
          <video
            ref={videoRef}
            // Pre-cut clip: starts on the thumbnail's own frame, so there's
            // no seek and no flash of the video's opening.
            src={`/api/media-items/${item.id}/preview`}
            onCanPlay={() => setReady(true)}
            muted
            loop
            autoPlay
            playsInline
            style={{
              opacity: ready ? 1 : 0,
              transition: "opacity 300ms ease-out",
            }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      ) : (
        <img
          src={thumbnailUrl(item)}
          alt=""
          style={framingStyle(item)}
          decoding="async"
          className="aspect-video w-full cursor-pointer overflow-hidden object-cover"
        />
      )}

      <div className="space-y-2.5 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlay(e);
            }}
            aria-label="Play"
            tabIndex={-1}
            className="flex size-9 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105"
          >
            <Play className="size-4 translate-x-px fill-black" />
          </button>

          {item.itemType === "video" && (
            <>
              <button
                type="button"
                onClick={(e) => handleQueue(e, false)}
                aria-label={queued ? "Already in queue" : "Add to queue"}
                title={queued ? "Already in queue" : "Add to queue"}
                tabIndex={-1}
                className="flex size-9 items-center justify-center rounded-full border border-white/40 text-foreground transition-colors hover:border-white disabled:opacity-50"
                disabled={queued}
              >
                {queued ? (
                  <Check className="size-4" />
                ) : (
                  <ListPlus className="size-4" />
                )}
              </button>
              <button
                type="button"
                onClick={(e) => handleQueue(e, true)}
                aria-label={queued ? "Already in queue" : "Play next"}
                title={queued ? "Already in queue" : "Play next"}
                tabIndex={-1}
                className="flex size-9 items-center justify-center rounded-full border border-white/40 text-foreground transition-colors hover:border-white disabled:opacity-50"
                disabled={queued}
              >
                <ListPlus className="size-4" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(e);
            }}
            aria-label="More info"
            tabIndex={-1}
            className="ml-auto flex size-9 items-center justify-center rounded-full border border-white/40 text-foreground transition-colors hover:border-white"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>

        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {item.title}
        </p>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {duration && (
            <span className="font-medium text-foreground/80">{duration}</span>
          )}
          {badge && (
            <span className="rounded border border-border px-1 py-px text-[10px] tracking-wide">
              {badge}
            </span>
          )}
          {item.studio && <span>{item.studio}</span>}
          {item.missingSince && (
            <span className="text-destructive">missing</span>
          )}
        </div>

        {(item.performers?.length || item.tags?.length) && (
          <p className="line-clamp-1 text-xs text-muted-foreground/80">
            {item.performers && item.performers.length > 0
              ? item.performers.map((p) => p.name).join("  •  ")
              : item.tags!.map((t) => t.name).join("  •  ")}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
