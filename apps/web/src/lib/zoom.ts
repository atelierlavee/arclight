// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

/**
 * The zoom-and-pan maths for the photo viewer, kept out of the component.
 *
 * Separated because it is the only part of the lightbox with a right and a
 * wrong answer that can be checked without a browser — everything else there
 * is layout. The rules it enforces are what stop a zoomed photo from being
 * dragged off screen and leaving an empty black frame with no way back.
 */

export type ZoomState = {
  /** 1 is fit-to-screen. */
  scale: number;
  /** Pixels, relative to the centred image at the current scale. */
  x: number;
  y: number;
};

export const ZOOM_RESET: ZoomState = { scale: 1, x: 0, y: 0 };

export const MIN_SCALE = 1;
export const MAX_SCALE = 8;

export function clampScale(scale: number): number {
  // NaN only. An infinity is a direction, and clamping it the same way as
  // any other out-of-range number is the answer the caller meant; collapsing
  // it to the minimum would zoom *out* in response to a hard zoom in.
  if (Number.isNaN(scale)) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * How far the image may be moved from centre at a given scale.
 *
 * Half the overhang: at scale 1 there is none, so the image is pinned to the
 * middle, and beyond that you can bring either edge to the corresponding edge
 * of the frame but no further. Without this the image can be flung into the
 * margin, and "where did my photo go" has no answer but a reset.
 */
export function panBounds(
  scale: number,
  frame: { width: number; height: number },
): { maxX: number; maxY: number } {
  const clamped = clampScale(scale);
  return {
    maxX: Math.max(0, (frame.width * (clamped - 1)) / 2),
    maxY: Math.max(0, (frame.height * (clamped - 1)) / 2),
  };
}

export function clampPan(
  state: ZoomState,
  frame: { width: number; height: number },
): ZoomState {
  const scale = clampScale(state.scale);
  const { maxX, maxY } = panBounds(scale, frame);
  return {
    scale,
    x: normaliseZero(Math.min(maxX, Math.max(-maxX, state.x))),
    y: normaliseZero(Math.min(maxY, Math.max(-maxY, state.y))),
  };
}

/**
 * Turns -0 into 0.
 *
 * Clamping a negative offset to a zero bound yields -0, which renders
 * identically and compares as equal with `===` but not with `Object.is` —
 * so two states that are the same picture can be treated as different by a
 * memo or an equality check. Normalising here keeps that out of everything
 * downstream.
 */
function normaliseZero(value: number): number {
  return value === 0 ? 0 : value;
}

/**
 * Zooms about a point, so the pixel under the cursor stays under the cursor.
 *
 * Zooming about the centre instead is the common shortcut and it is why so
 * many viewers feel like they fight you: the detail you are pointing at
 * slides away exactly as you try to magnify it.
 *
 * `origin` is measured from the centre of the frame, in frame pixels.
 */
export function zoomAt(
  state: ZoomState,
  nextScale: number,
  origin: { x: number; y: number },
  frame: { width: number; height: number },
): ZoomState {
  const scale = clampScale(nextScale);
  const ratio = scale / state.scale;

  // The point's offset from the image's own centre scales with the image;
  // holding it still under the cursor means moving the image by the
  // difference.
  return clampPan(
    {
      scale,
      x: origin.x - (origin.x - state.x) * ratio,
      y: origin.y - (origin.y - state.y) * ratio,
    },
    frame,
  );
}

/** Whether the image is zoomed enough that dragging should pan it. */
export function isPannable(state: ZoomState): boolean {
  return state.scale > MIN_SCALE;
}
