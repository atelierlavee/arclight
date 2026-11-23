// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { Images } from "lucide-react";
import { coverFramingStyle, type AlbumSummary } from "@/lib/albumApi";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { cn } from "@/lib/utils";

/**
 * How far the sheets behind the cover tilt, in degrees, resting and on hover.
 * The one number to change to make the stack looser or tighter.
 */
const TILT = 6;
const TILT_HOVER = 11;

/**
 * An album's cover as a stack of prints, like a Procreate stack.
 *
 * Sheets behind the cover mean "more than one photo": none for a single
 * photo, one for two, two for three or more. Each shows a different photo
 * from the album, slightly dimmed. Put it inside a `group`: the sheets
 * fan out when the group is hovered.
 */
export function AlbumStack({
  album,
  opening = false,
}: {
  album: AlbumSummary;
  /**
   * Names the cover and sheets for the view transition into the album page,
   * which names the same photos there. Only the card being opened sets it:
   * a transition name must be unique on the page, and every card has these.
   */
  opening?: boolean;
}) {
  const framing = coverFramingStyle(album);
  const sheets = Math.min(2, Math.max(0, album.photoCount - 1));
  const src = album.coverItemId != null ? thumbnailUrl({ id: album.coverItemId }) : null;
  // Other photos than the cover, so each sheet shows something different.
  const others = (album.previewItemIds ?? []).filter((id) => id !== album.coverItemId);

  const transitionName = (id: number | null | undefined) =>
    opening && id != null ? { viewTransitionName: `album-photo-${id}` } : undefined;

  const sheet = (index: number) => {
    // Alternate sides so the two sheets peek out either side of the cover.
    const side = index === 1 ? -1 : 1;
    return (
      <div
        key={index}
        aria-hidden
        className="absolute inset-0 overflow-hidden rounded-lg bg-secondary ring-1 ring-border transition-transform duration-300 ease-out [transform:rotate(var(--r))_scale(0.97)] group-hover:[transform:rotate(var(--rh))_scale(0.97)]"
        style={
          {
            "--r": `${side * TILT * index}deg`,
            "--rh": `${side * TILT_HOVER * index}deg`,
            zIndex: -index,
            // Only a sheet showing its own photo can morph into that photo's
            // tile; one falling back on the cover would clash with its name.
            ...transitionName(others[index - 1]),
          } as React.CSSProperties
        }
      >
        {(others[index - 1] ?? album.coverItemId) != null && (
          <img
            src={thumbnailUrl({ id: (others[index - 1] ?? album.coverItemId)! })}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover brightness-75"
          />
        )}
      </div>
    );
  };

  return (
    // isolate keeps the negative z-index sheets inside this card instead of
    // sliding behind the page background.
    <div className="relative isolate aspect-[3/2] w-full">
      {Array.from({ length: sheets }, (_, i) => sheet(i + 1))}
      <div
        style={transitionName(album.coverItemId)}
        className="relative h-full w-full overflow-hidden rounded-lg bg-secondary ring-1 ring-border transition-all duration-200 group-hover:ring-white/40"
      >
        {src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            style={framing}
            className={cn(
              "h-full w-full object-cover transition-transform duration-300",
              !framing && "group-hover:scale-[1.03]"
            )}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Images className="size-8 text-muted-foreground" />
          </div>
        )}
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          <Images className="size-3" />
          {album.photoCount}
        </span>
      </div>
    </div>
  );
}
