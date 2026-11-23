// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

/**
 * Where the expanded hover card goes, and how big it is allowed to be.
 *
 * Extracted from the component because it is arithmetic against the viewport
 * and the bug it fixes is invisible until a tile happens to be large: the
 * width was scaled without being clamped, so only the *position* was kept on
 * screen and a near-full-width tile grew straight off the right-hand edge.
 */

export const EXPANDED_SCALE = 1.85;
export const VIEWPORT_MARGIN = 8;

/**
 * Below this share of the window, growing a tile shows you meaningfully more
 * of it. At or above, the expanded card would be clamped back to roughly the
 * size the tile already is, so all the hover would do is make the picture
 * jump.
 */
const WORTH_EXPANDING_SHARE = 0.6;

export function worthExpanding(
  anchorWidth: number,
  viewportWidth: number,
): boolean {
  return anchorWidth < viewportWidth * WORTH_EXPANDING_SHARE;
}

export type HoverCardBox = { left: number; top: number; width: number };

export function hoverCardBox(
  anchor: { left: number; top: number; width: number },
  viewport: { width: number; height: number },
): HoverCardBox {
  // Never wider than the window. This is the clamp that was missing.
  const width = Math.max(
    0,
    Math.min(
      anchor.width * EXPANDED_SCALE,
      viewport.width - VIEWPORT_MARGIN * 2,
    ),
  );

  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(
      anchor.left + anchor.width / 2 - width / 2,
      viewport.width - width - VIEWPORT_MARGIN,
    ),
  );

  // Centred on the thumbnail it grew from, then bounded top *and* bottom: a
  // card anchored low used to hang below the fold with its controls out of
  // reach.
  const thumbGrowth = (width - anchor.width) * (9 / 16);
  const maxTop = Math.max(
    VIEWPORT_MARGIN,
    viewport.height - (width * 9) / 16 - VIEWPORT_MARGIN,
  );
  const top = Math.min(
    maxTop,
    Math.max(VIEWPORT_MARGIN, anchor.top - thumbGrowth / 2),
  );

  return { left, top, width };
}


/** Gap between a flyout and the tile it belongs to. */
const FLYOUT_GAP = 12;

export type FlyoutBox = {
  left: number;
  top: number;
  /** Which side of the anchor it ended up on, so a caret can point back. */
  side: "left" | "right";
  /** Where the caret sits down the card's own edge, in pixels from its top. */
  caretTop: number;
};

/**
 * Places a fixed-size card beside the thing it belongs to.
 *
 * Beside rather than over: a panel covering its own tile hides the picture
 * you are pointing at, and one dropped underneath covers the row below and
 * reads as a menu belonging to the page. To the side it reads as a flyout
 * from that tile, and the tile stays visible next to it.
 *
 * Right by default, flipping left when there is no room — a tile in the last
 * column would otherwise push the card off the screen. When neither side
 * fits, the wider side wins and the card is clamped into it.
 */
export function flyoutBox(
  anchor: { left: number; top: number; width: number; height: number },
  viewport: { width: number; height: number },
  size: { width: number; height: number },
): FlyoutBox {
  const rightEdge = anchor.left + anchor.width + FLYOUT_GAP;
  const leftEdge = anchor.left - size.width - FLYOUT_GAP;

  const fitsRight = rightEdge + size.width <= viewport.width - VIEWPORT_MARGIN;
  const fitsLeft = leftEdge >= VIEWPORT_MARGIN;
  const roomRight = viewport.width - (anchor.left + anchor.width);
  const side: "left" | "right" = fitsRight
    ? "right"
    : fitsLeft
      ? "left"
      : roomRight >= anchor.left
        ? "right"
        : "left";

  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(
      side === "right" ? rightEdge : leftEdge,
      viewport.width - size.width - VIEWPORT_MARGIN,
    ),
  );

  // Centred on the tile vertically, then kept inside the window.
  const top = Math.max(
    VIEWPORT_MARGIN,
    Math.min(
      anchor.top + anchor.height / 2 - size.height / 2,
      viewport.height - size.height - VIEWPORT_MARGIN,
    ),
  );

  // The caret points at the tile's middle, but must stay on the card's edge
  // even when clamping has slid the card away from its anchor.
  const CARET_INSET = 16;
  const caretTop = Math.max(
    CARET_INSET,
    Math.min(anchor.top + anchor.height / 2 - top, size.height - CARET_INSET),
  );

  return { left, top, side, caretTop };
}
