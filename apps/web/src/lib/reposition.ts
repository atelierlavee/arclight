// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import type React from "react";

/**
 * Shared maths for drag-to-reframe on an `object-cover` image.
 *
 * The file is never cropped — framing only moves CSS `object-position` and
 * `transform`, so it stays adjustable forever and costs no image quality.
 *
 * Used by both the performer banner and the category tile covers, so the
 * fiddly part — working out how far the image can actually travel — has a
 * single implementation.
 */

export type Framing = { x: number; y: number };

export type FrameMetrics = {
  /** The visible frame. */
  containerWidth: number;
  containerHeight: number;
  /** The image's intrinsic size, needed to know how much it overflows. */
  naturalWidth: number;
  naturalHeight: number;
  /** Zoom on top of the cover fit, as a multiplier (1 = none). */
  zoom: number;
};

/**
 * How far the image can travel in each axis, in on-screen pixels.
 *
 * There are two separate sources of hidden image, and they don't combine the
 * way you'd first guess:
 *
 *  - **The cover fit.** `object-fit: cover` scales the source until it covers
 *    the frame, so exactly one axis overflows — whichever the source is
 *    "longer" in relative to the frame. That overflow is what
 *    `object-position` pans through. Crucially it's *inside* the element, so
 *    a later `scale(z)` magnifies it: one source pixel of pan shows up as z
 *    pixels of movement.
 *  - **The zoom.** Scaling a frame-sized box by z hides `(z - 1) x size` of
 *    it, panned by moving the transform origin. That figure is already in
 *    screen pixels, so it isn't multiplied again.
 *
 * At zoom 1 only one axis can move, which is why dragging sideways does
 * nothing until you zoom in on a normal landscape cover — there is genuinely
 * nothing hidden to the left or right.
 */
export function framingTravel(metrics: FrameMetrics): Framing {
  const { containerWidth, containerHeight, naturalWidth, naturalHeight } = metrics;
  if (!naturalWidth || !naturalHeight || !containerWidth || !containerHeight) {
    return { x: 0, y: 0 };
  }

  const zoom = metrics.zoom > 0 ? metrics.zoom : 1;
  const coverScale = Math.max(containerWidth / naturalWidth, containerHeight / naturalHeight);
  const coverOverflowX = Math.max(0, naturalWidth * coverScale - containerWidth);
  const coverOverflowY = Math.max(0, naturalHeight * coverScale - containerHeight);

  return {
    x: coverOverflowX * zoom + (zoom - 1) * containerWidth,
    y: coverOverflowY * zoom + (zoom - 1) * containerHeight,
  };
}

/**
 * The new framing percentages for a drag.
 *
 * Dividing by the real travel is what makes the image track the cursor
 * one-to-one rather than drifting at some arbitrary sensitivity that feels
 * different on every image and every zoom level. An axis with no travel is
 * left untouched rather than clamped, so a dead axis can't quietly reset a
 * framing you already chose.
 */
export function framingAfterDrag(
  metrics: FrameMetrics,
  start: Framing,
  deltaX: number,
  deltaY: number
): Framing {
  const travel = framingTravel(metrics);
  // Dragging down or right should reveal what's above or to the left, hence
  // the subtraction.
  return {
    x: travel.x > 0 ? clamp(start.x - (deltaX / travel.x) * 100) : start.x,
    y: travel.y > 0 ? clamp(start.y - (deltaY / travel.y) * 100) : start.y,
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * The CSS for a focal point.
 *
 * One stored pair of percentages is valid at every frame ratio, which is what
 * lets a single decision hold across a 16:10 tile, a 5:7.5 tile and a hero
 * banner. With `object-fit: cover` and `object-position: p%`, the image point
 * at fraction p lands at fraction p of the frame regardless of the frame's
 * shape: the offset is `(C - S)p`, so that point sits at `(C - S)p + pS = pC`.
 * The frame size cancels, so the marked subject can never be cropped out.
 *
 * `transformOrigin` matches the position so zooming magnifies around the
 * subject rather than pulling away from it.
 */
export function focalStyle(focal: Framing, zoom: number): React.CSSProperties {
  return {
    objectPosition: `${focal.x}% ${focal.y}%`,
    transform: `scale(${zoom / 100})`,
    transformOrigin: `${focal.x}% ${focal.y}%`,
  };
}

/** The span of the source actually shown, as fractions from 0 to 1. */
export type Band = { start: number; end: number };

/**
 * Which part of the source a frame of a given ratio will show.
 *
 * Drives the preview outlines in the focal-point editor, and is the thing
 * worth asserting in tests: whatever the ratio, the focal point stays inside
 * the returned band, because `start = p(1 - size)` is never above p and
 * `end = start + size` is never below it.
 *
 * Ratios are width/height. A zoom above 100 narrows both bands, since it
 * magnifies the image inside the same frame.
 */
export function visibleBand(
  focal: Framing,
  imageRatio: number,
  frameRatio: number,
  zoom = 100,
): { x: Band; y: Band } {
  // Guard the degenerate cases rather than returning NaN — this runs against
  // an image whose natural size may not have loaded yet.
  if (!(imageRatio > 0) || !(frameRatio > 0)) {
    return { x: { start: 0, end: 1 }, y: { start: 0, end: 1 } };
  }

  const scale = zoom > 0 ? zoom / 100 : 1;
  // Exactly one axis overflows under `cover`: the one the image is "longer"
  // in relative to the frame. The other is shown whole.
  const widthFraction = imageRatio > frameRatio ? frameRatio / imageRatio : 1;
  const heightFraction = imageRatio < frameRatio ? imageRatio / frameRatio : 1;

  return {
    x: bandFor(focal.x / 100, widthFraction / scale),
    y: bandFor(focal.y / 100, heightFraction / scale),
  };
}

function bandFor(point: number, rawSize: number): Band {
  const size = Math.min(1, Math.max(0, rawSize));
  // `object-position: p` puts source point p at frame fraction p, so the
  // window starts at p(1 - size). At p = 0 that pins the left edge, at p = 1
  // the right, and at 0.5 it centres — the behaviour object-position already
  // has, written out so the previews can draw it.
  const start = point * (1 - size);
  return { start, end: start + size };
}
