// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  clampPan,
  clampScale,
  isPannable,
  MAX_SCALE,
  MIN_SCALE,
  panBounds,
  ZOOM_RESET,
  zoomAt,
} from "./zoom";

const frame = { width: 1000, height: 800 };

describe("clampScale", () => {
  it("holds the zoom inside its range", () => {
    expect(clampScale(0.2)).toBe(MIN_SCALE);
    expect(clampScale(99)).toBe(MAX_SCALE);
    expect(clampScale(2)).toBe(2);
  });

  it("falls back rather than propagating a NaN into a transform", () => {
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(MAX_SCALE);
  });
});

describe("panBounds", () => {
  // At fit-to-screen there is no overhang, so there is nothing to pan to and
  // the image stays centred.
  it("allows no movement at all when the image fits", () => {
    expect(panBounds(1, frame)).toEqual({ maxX: 0, maxY: 0 });
  });

  it("allows half the overhang in each direction", () => {
    expect(panBounds(2, frame)).toEqual({ maxX: 500, maxY: 400 });
  });
});

describe("clampPan", () => {
  it("pins the image to the centre at fit-to-screen", () => {
    expect(clampPan({ scale: 1, x: 400, y: -300 }, frame)).toEqual(ZOOM_RESET);
  });

  // Without this the image can be flung into the margin, leaving an empty
  // black frame with no way back but a reset.
  it("stops an edge being dragged past the frame", () => {
    expect(clampPan({ scale: 2, x: 9999, y: -9999 }, frame)).toEqual({
      scale: 2,
      x: 500,
      y: -400,
    });
  });

  it("leaves an in-bounds position alone", () => {
    expect(clampPan({ scale: 2, x: 100, y: 50 }, frame)).toEqual({
      scale: 2,
      x: 100,
      y: 50,
    });
  });
});

describe("zoomAt", () => {
  // Zooming about the centre is why so many viewers feel like they fight
  // you: the detail you are pointing at slides away as you magnify it.
  it("keeps the point under the cursor still", () => {
    const origin = { x: 200, y: 100 };
    const next = zoomAt(ZOOM_RESET, 2, origin, frame);

    // The image point under `origin` was at (origin - x)/scale before, and
    // must be at the same place after.
    const before = (origin.x - ZOOM_RESET.x) / ZOOM_RESET.scale;
    const after = (origin.x - next.x) / next.scale;
    expect(after).toBeCloseTo(before);
  });

  it("zooming about the centre moves nothing", () => {
    expect(zoomAt(ZOOM_RESET, 3, { x: 0, y: 0 }, frame)).toEqual({
      scale: 3,
      x: 0,
      y: 0,
    });
  });

  it("returns to a centred image when zoomed back out", () => {
    const zoomed = zoomAt(ZOOM_RESET, 4, { x: 300, y: 200 }, frame);
    expect(zoomAt(zoomed, 1, { x: 300, y: 200 }, frame)).toEqual(ZOOM_RESET);
  });

  it("never leaves the image out of bounds, however far the origin is", () => {
    const next = zoomAt(ZOOM_RESET, 2, { x: 5000, y: 5000 }, frame);
    const { maxX, maxY } = panBounds(next.scale, frame);
    expect(Math.abs(next.x)).toBeLessThanOrEqual(maxX);
    expect(Math.abs(next.y)).toBeLessThanOrEqual(maxY);
  });
});

describe("isPannable", () => {
  it("is false at fit-to-screen, so a drag can mean something else", () => {
    expect(isPannable(ZOOM_RESET)).toBe(false);
    expect(isPannable({ scale: 1.5, x: 0, y: 0 })).toBe(true);
  });
});
