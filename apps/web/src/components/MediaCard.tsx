// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Eye,
  Heart,
  Film,
  Folder,
  Image as ImageIcon,
  Pin,
} from "lucide-react";
import { framingStyle, thumbnailUrl } from "@/lib/mediaItemApi";
import { useAppearance } from "@/lib/appearance";
import { cardChrome, tileWidthFraction } from "@/lib/layout";
import { worthExpanding } from "@/lib/hoverCard";
import { cn } from "@/lib/utils";
import { HoverPreviewCard } from "./HoverPreviewCard";
import { isPinned, togglePin } from "@/lib/pinned";
import { useCardShortcuts } from "@/lib/cardShortcuts";

export type MediaCardItem = {
  id: number;
  itemType: "video" | "photo" | "folder";
  title: string;
  durationSeconds: number | null;
  missingSince: string | null;
  lastPositionSeconds?: number;
  thumbnailFile?: string | null;
  /** Framing chosen in the detail modal; defaults mean "untouched". */
  thumbnailPositionX?: number;
  thumbnailPositionY?: number;
  thumbnailScale?: number;
  /**
   * This tile's own shape, set from its right-click menu.
   *
   * Optional *and* nullable, and the two mean different things: undefined is
   * "this caller does not send the field", null is "the server says follow
   * the Appearance setting". Both fall back to the global shape, so a surface
   * that never selects the column keeps working.
   */
  tileShape?: "landscape" | "portrait" | null;
  rating?: number | null;
  description?: string | null;
  /**
   * State the tile shows, and which the list endpoint has always returned —
   * it simply was not declared here, so nothing drew it (§2).
   *
   * Without these a keyboard favourite or watch toggle leaves no trace on the
   * grid at all: the action works, the toast confirms it, and then the tile
   * looks exactly as it did. The shortcut reads as broken.
   */
  isFavorite?: boolean;
  watched?: boolean;
  /** When the current profile saved it to Watch Later, or null. */
  watchLaterAt?: string | null;
  tags?: { id: number; name: string }[];
  performers?: { id: number; name: string }[];
  studio?: string | null;
  /** ISO "YYYY-MM-DD" parsed from the filename, or null. Shown as the year. */
  releaseDate?: string | null;
  extraMetadata?: { width?: number; height?: number; codec?: string } | null;
};

// Dwell time before the expanded hover card appears, so sweeping the mouse
// across a row doesn't pop a card open (and start a stream) for every item.
const HOVER_DELAY_MS = 450;

export function MediaCard({
  item,
  onClick,
  onPlay,
  onContextMenu,
  onDragStart,
  selectable = false,
  selected = false,
  className,
  shapeSizedByContainer = false,
  tabIndex,
  gridIndex,
}: {
  item: MediaCardItem;
  /**
   * Receives the event so a grid running a selection can read Ctrl/Cmd and
   * Shift off it. Card-level behaviour never looks at them.
   */
  onClick: (event: React.MouseEvent | React.KeyboardEvent) => void;
  onPlay?: (event: React.MouseEvent | React.KeyboardEvent) => void;
  /** Right-click. The grid owns the menu; the card only reports the event. */
  onContextMenu?: (event: React.MouseEvent) => void;
  /**
   * What this card contributes to a drag (§13). The grid decides, because a
   * drag of a selected card carries the whole selection rather than just the
   * one under the pointer.
   */
  onDragStart?: (event: React.DragEvent) => void;
  selectable?: boolean;
  selected?: boolean;
  className?: string;
  /**
   * Set by a container that has already narrowed this tile's slot to suit its
   * shape — a row, where each tile is its own flex item and can simply be
   * given a smaller width.
   *
   * Without it the card narrows itself inside a slot that is already the
   * right size, shrinking twice. Left unset in a uniform grid, where every
   * column is the same width and the odd-shaped tile has to be centred in
   * one, gaps and all.
   */
  shapeSizedByContainer?: boolean;
  /**
   * Set by a virtualized grid running a roving tab stop, so Tab enters the
   * grid once and the arrow keys move within it. Left undefined elsewhere,
   * where every card being a tab stop is the right behaviour.
   */
  tabIndex?: number;
  /** Flat position in that grid, so it can find this card to focus it. */
  gridIndex?: number;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<HTMLButtonElement>(null);

  const {
    hoverZoom,
    hoverPreview,
    discreet,
    tileInfo: tileInfoSetting,
    tileShape,
    density,
  } = useAppearance();
  // Density decides how tightly the text sits in the frame, and the shape
  // decides how the artwork is cropped. The card's width is the grid's
  // business, so nothing here depends on the view mode.
  //
  // The item's own shape wins over the Appearance setting, which is what
  // makes a single tile portrait in a landscape library. Only the *crop*
  // changes: the column width is the grid's, identical for every tile, so a
  // portrait one is the same width as its neighbours and simply taller.
  const shape = item.tileShape ?? tileShape;
  const chrome = cardChrome(density, tileInfoSetting, shape);
  // How much of its column this tile takes. Below 1 only when its own shape
  // is taller than the one the column was sized for — otherwise a portrait
  // tile among landscape ones keeps the full width and stands two and a half
  // times their height.
  const widthFraction = shapeSizedByContainer
    ? 1
    : tileWidthFraction(shape, tileShape);
  // Just the year: a caption under a tile has room for "X-Art · 2013" and not
  // for a full date, and the year is the part that places a scene.
  const releaseYear = item.releaseDate?.slice(0, 4) ?? null;
  const tileInfo = chrome.tileInfo;
  const [previewing, setPreviewing] = useState(false);
  /**
   * Reported to the shortcut layer so the keys act on this card (§24).
   *
   * "Engaged" is wider than `:hover` on the tile: once the expanded preview
   * card opens, the pointer is over *that*, which is portalled to the body
   * and is not a descendant of the tile at all. Giving up the target there
   * would take the shortcuts away at exactly the moment you are looking at
   * the thing you want to act on — so the tile's own mouseleave only
   * releases it when no preview card is standing.
   */
  const { setEngagement } = useCardShortcuts();
  const engage = (via: "focus" | "hover", on: boolean) =>
    setEngagement(
      {
        id: item.id,
        title: item.title,
        itemType: item.itemType,
        thumbnailFile: item.thumbnailFile,
        durationSeconds: item.durationSeconds,
      },
      via,
      on,
    );

  const [pinned, setPinned] = useState(
    () => item.itemType === "folder" && isPinned(`folder:${item.id}`),
  );

  const showImage = item.itemType !== "folder" && !thumbFailed;
  // Turned off in the Appearance panel, a tile stays a tile — it still opens,
  // it just never grows into a preview card under the pointer.
  const canExpand = hoverZoom && !selectable && item.itemType !== "folder";
  // With the zoom off there is no expanded card for the clip to play in, so
  // it plays in the tile itself instead. Otherwise turning the zoom off would
  // silently take the preview with it, which is two settings behaving as one.
  // Never while discreet: a blurred still is quiet, but movement under the
  // pointer is the thing someone across the room actually notices.
  const canPreviewInline =
    hoverPreview &&
    !discreet &&
    !hoverZoom &&
    !selectable &&
    item.itemType === "video";

  const progressPercent =
    item.lastPositionSeconds && item.durationSeconds
      ? Math.min(
          100,
          Math.round((item.lastPositionSeconds / item.durationSeconds) * 100),
        )
      : null;

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, []);

  function expand() {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    // A big tile falls back to playing the clip in place, which is what the
    // zoom-off path already does — so turning out to be too large costs you
    // the growth animation, not the preview.
    if (!worthExpanding(rect.width, window.innerWidth)) {
      if (hoverPreview && !discreet && item.itemType === "video") {
        setPreviewing(true);
      }
      return;
    }
    setAnchorRect(rect);
  }

  function handleMouseEnter() {
    engage("hover", true);
    // The same dwell delay either way: sweeping the pointer along a row
    // shouldn't start a dozen clip downloads any more than it should throw up
    // a dozen cards.
    if (canExpand) hoverTimer.current = setTimeout(expand, HOVER_DELAY_MS);
    else if (canPreviewInline)
      hoverTimer.current = setTimeout(
        () => setPreviewing(true),
        HOVER_DELAY_MS,
      );
  }

  // Keyboard focus expands immediately — a dwell delay only makes sense for
  // a mouse sweeping across a row, and waiting after a deliberate Tab would
  // just feel broken.
  function handleFocus() {
    engage("focus", true);
    if (canExpand) expand();
  }

  function cancelHover() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    // Unmounts the clip rather than pausing it, so leaving a tile actually
    // stops the download instead of leaving it buffering off-screen.
    setPreviewing(false);
  }

  /**
   * Leaving the tile itself.
   *
   * Only gives up the shortcut target when no expanded card is open — when
   * one is, the pointer has moved *onto* it rather than away, and the card's
   * own dismissal is what ends the engagement.
   */
  function handleMouseLeave() {
    cancelHover();
    if (!anchorRect) engage("hover", false);
  }

  /**
   * Opening the detail modal must also tear down the hover card.
   *
   * The hover card only dismissed on its own mouseleave — but the modal
   * covers it, so the pointer never leaves and it stayed sitting underneath.
   * Both entry points (the tile, and the buttons on the expanded card) go
   * through here.
   */
  function openItem(
    action: (event: React.MouseEvent | React.KeyboardEvent) => void,
    event: React.MouseEvent | React.KeyboardEvent,
  ) {
    cancelHover();
    setAnchorRect(null);
    action(event);
  }

  return (
    <>
      <button
        ref={cardRef}
        type="button"
        tabIndex={tabIndex}
        data-grid-index={gridIndex}
        onClick={(event) => openItem(onClick, event)}
        draggable={Boolean(onDragStart) && item.itemType !== "folder"}
        onDragStart={(event) => {
          // The hover card would otherwise stay open for the whole drag,
          // following nothing and covering every drop target on the way.
          cancelHover();
          setAnchorRect(null);
          onDragStart?.(event);
        }}
        onContextMenu={(event) => {
          // Tearing down the hover card first: the menu opens over the top of
          // it, so the pointer never leaves and it would sit there underneath.
          cancelHover();
          setAnchorRect(null);
          onContextMenu?.(event);
        }}
        onMouseEnter={handleMouseEnter}
        // The expanded card overlays this one, so only cancel a *pending*
        // hover here — dismissing the open card is its own mouseleave.
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={() => {
          cancelHover();
          setAnchorRect(null);
          engage("focus", false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAnchorRect(null);
        }}
        className={cn(
          "motion-card group relative w-full shrink-0 rounded-md text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          className,
        )}
      >
        <div
          className={cn(
            // 16:10 rather than 16:9. The frames themselves are widescreen, so this
            // crops a sliver off each side — the tile reads as slightly taller
            // without the artwork losing anything that matters.
            // 16:10 rather than 16:9. The frames themselves are widescreen, so this
            // crops a sliver off each side — the tile reads as slightly taller
            // without the artwork losing anything that matters.
            "relative overflow-hidden rounded-md bg-secondary ring-1 ring-border transition-all duration-200",
            // Centred rather than left-aligned when it is narrower than its
            // column, so a row of mixed shapes reads as a row rather than as
            // tiles that failed to line up.
            "mx-auto w-full",
            !selectable && "group-hover:ring-white/40",
            selected && "ring-2 ring-primary",
            item.missingSince && "opacity-50",
          )}
          style={{
            aspectRatio: chrome.aspectRatio,
            // Only written when it actually narrows the tile, so the ordinary
            // case sets no inline width at all.
            ...(widthFraction < 1
              ? { maxWidth: `${(widthFraction * 100).toFixed(2)}%` }
              : {}),
          }}
        >
          {showImage ? (
            <>
              <img
                src={thumbnailUrl(item)}
                style={framingStyle(item)}
                alt=""
                // The grid can hold thousands of these. Off-screen tiles cost
                // nothing until they're scrolled near, and decoding off the
                // main thread keeps a fast scroll from stuttering. Safe
                // against layout shift: the frame is already sized, so the
                // image never decides the tile's geometry.
                loading="lazy"
                decoding="async"
                onError={() => setThumbFailed(true)}
                className="h-full w-full object-cover"
              />
              {previewing && (
                // Over the thumbnail rather than replacing it: the clip fades
                // in only once it can play, so the tile never blinks to black
                // while it buffers.
                /* eslint-disable-next-line jsx-a11y/media-has-caption -- silent hover preview */
                <video
                  src={`/api/media-items/${item.id}/preview`}
                  onCanPlay={(event) =>
                    (event.currentTarget.style.opacity = "1")
                  }
                  muted
                  loop
                  autoPlay
                  playsInline
                  style={{ opacity: 0, transition: "opacity 300ms ease-out" }}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {item.itemType === "folder" ? (
                <Folder className="size-8 text-muted-foreground" />
              ) : item.itemType === "video" ? (
                <Film className="size-8 text-muted-foreground" />
              ) : (
                <ImageIcon className="size-8 text-muted-foreground" />
              )}
            </div>
          )}

          {item.missingSince && (
            <span className="absolute left-1 top-1 rounded bg-destructive/90 px-1.5 py-0.5 text-[10px] text-white">
              missing
            </span>
          )}

          {/* Favourite and watched, shown in every mode including "None".
              They are state rather than a label — the same reasoning the
              progress bar below already follows — and losing track of what
              you have marked would be a real cost rather than less clutter.

              Hidden while selecting, where the top-right corner belongs to
              the selection tick and two indicators in one place would read
              as one confusing control. */}
          {!selectable && (item.isFavorite || item.watched) && (
            <span className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-1 ring-1 ring-white/15">
              {item.isFavorite && (
                <Heart
                  aria-label="Favourite"
                  className="size-3 fill-red-500 text-red-500"
                />
              )}
              {item.watched && (
                <Eye aria-label="Watched" className="size-3 text-white/90" />
              )}
            </span>
          )}

          {selectable && (
            <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-0.5">
              {selected ? (
                <CheckCircle2 className="size-5 text-primary" />
              ) : (
                <Circle className="size-5 text-white/80" />
              )}
            </span>
          )}

          {/* Desktop only. On a phone a corner control sits over the artwork
              permanently — there is no hover to reveal it on — so every folder
              tile carried a button it could never hide. */}
          {item.itemType === "folder" && (
            <span className="absolute left-1.5 top-1.5 z-10 hidden md:block">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  togglePin({
                    id: `folder:${item.id}`,
                    type: "folder",
                    label: item.title,
                    folderId: item.id,
                  });
                  setPinned((value) => !value);
                }}
                aria-pressed={pinned}
                aria-label={
                  pinned ? `Unpin ${item.title}` : `Pin ${item.title}`
                }
                title={pinned ? "Unpin folder" : "Pin folder"}
                className="flex size-7 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/20"
              >
                <Pin className={cn("size-3.5", pinned && "fill-white")} />
              </button>
            </span>
          )}

          {/* Sits before the progress bar in the DOM so that 1px line still
              paints on top of the gradient rather than under it.

              The gradient goes with the text: on "None" it would be a dark
              band over the bottom third of a picture with nothing written on
              it. The progress bar and the watched tick stay in every mode —
              they're state, not a label, and losing track of what you'd
              already started would be a real cost rather than less clutter. */}
          {tileInfo !== "none" && tileInfo !== "below" && (
            <span
              className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-8"
              style={{
                paddingLeft: chrome.paddingPx,
                paddingRight: chrome.paddingPx,
                paddingBottom: Math.max(2, chrome.paddingPx - 2),
              }}
            >
              {tileInfo === "full" &&
                item.performers &&
                item.performers.length > 0 && (
                  // One line only: with the title clamped to two below it, a
                  // wrapping cast list would push the title off the tile.
                  <span className="sensitive block truncate text-[10px] font-medium uppercase tracking-wide text-white/70">
                    {item.performers.map((p) => p.name).join(", ")}
                  </span>
                )}
              <span className="sensitive line-clamp-2 text-xs font-medium leading-snug text-white drop-shadow">
                {item.title}
              </span>
            </span>
          )}

          {progressPercent !== null && (
            <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
              <span
                className="block h-full bg-white"
                style={{ width: `${progressPercent}%` }}
              />
            </span>
          )}
        </div>

        {/* The caption, under the frame rather than over it.
            Inside the button so the whole card stays one target, and
            left-aligned because a centred caption under a left-aligned grid
            reads as a mistake. Title first: it is what you scan for, and
            putting the cast above it — as the overlay does, where the picture
            already tells you who it is — buries it. */}
        {tileInfo === "below" && (
          <span
            className="mx-auto block w-full text-left"
            style={{
              maxWidth: widthFraction < 1 ? `${(widthFraction * 100).toFixed(2)}%` : undefined,
              paddingTop: Math.max(6, chrome.paddingPx - 2),
            }}
          >
            <span className="sensitive line-clamp-2 text-xs font-medium leading-snug text-foreground">
              {item.title}
            </span>
            {item.performers && item.performers.length > 0 && (
              <span className="sensitive mt-0.5 block truncate text-[11px] text-muted-foreground">
                {item.performers.map((p) => p.name).join(", ")}
              </span>
            )}
            {(item.studio || releaseYear) && (
              <span className="sensitive mt-0.5 block truncate text-[11px] text-muted-foreground/70">
                {[item.studio, releaseYear].filter(Boolean).join(" \u00b7 ")}
              </span>
            )}
          </span>
        )}
      </button>

      {anchorRect && (
        <HoverPreviewCard
          item={item}
          anchorRect={anchorRect}
          onOpen={(event) => openItem(onClick, event)}
          onPlay={(event) => openItem(onPlay ?? onClick, event)}
          onDismiss={() => {
            setAnchorRect(null);
            engage("hover", false);
          }}
          onContextMenu={(event) => {
            // Same teardown as the tile's own handler: the menu opens over
            // this card, so the pointer never leaves it and it would other-
            // wise stay open underneath the menu.
            cancelHover();
            setAnchorRect(null);
            onContextMenu?.(event);
          }}
        />
      )}
    </>
  );
}
