// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  focalStyle,
  framingAfterDrag,
  framingTravel,
  visibleBand,
  type FrameMetrics,
} from "./reposition.js";

// A 16:9 image inside a wide 2.18:1 tile: cover scales it to the tile's width,
// so it overflows vertically and fits exactly horizontally.
const wideFrame: FrameMetrics = {
  containerWidth: 384,
  containerHeight: 176,
  naturalWidth: 1920,
  naturalHeight: 1080,
  zoom: 1,
};

// The three shapes one thumbnail is actually drawn at, as width/height.
const LANDSCAPE_TILE = 16 / 10;
const PORTRAIT_TILE = 5 / 7.5;
const HERO = 3.2;
// A 16:9 still — wider than either tile, narrower than the hero.
const STILL = 16 / 9;

describe("framingTravel", () => {
  it("reports vertical travel and no horizontal travel at zoom 1", () => {
    const travel = framingTravel(wideFrame);
    expect(travel.x).toBe(0);
    // 1080/1920 * 384 = 216 rendered height, less the 176 frame.
    expect(travel.y).toBeCloseTo(40, 5);
  });

  it("unlocks horizontal travel once zoomed in", () => {
    const travel = framingTravel({ ...wideFrame, zoom: 1.5 });
    expect(travel.x).toBeGreaterThan(0);
    expect(travel.y).toBeGreaterThan(40);
  });

  it("magnifies the cover overflow by the zoom, but not the zoom overflow", () => {
    // cover overflow (40) * 2 + (2 - 1) * 176 = 256. Getting this wrong is
    // what makes a drag drift away from the cursor.
    expect(framingTravel({ ...wideFrame, zoom: 2 }).y).toBeCloseTo(256, 5);
  });

  it("returns no travel when the image exactly fits", () => {
    const travel = framingTravel({
      containerWidth: 160,
      containerHeight: 90,
      naturalWidth: 1920,
      naturalHeight: 1080,
      zoom: 1,
    });
    expect(travel.x).toBeCloseTo(0, 5);
    expect(travel.y).toBeCloseTo(0, 5);
  });

  it("returns zero rather than NaN before the image has loaded", () => {
    expect(framingTravel({ ...wideFrame, naturalWidth: 0, naturalHeight: 0 })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("treats a zero or negative zoom as no zoom", () => {
    expect(framingTravel({ ...wideFrame, zoom: 0 })).toEqual(framingTravel(wideFrame));
  });
});

describe("framingAfterDrag", () => {
  const start = { x: 50, y: 50 };

  it("moves the framing opposite to the drag, so the image follows the cursor", () => {
    // Dragging down reveals what is above, so the percentage decreases.
    expect(framingAfterDrag(wideFrame, start, 0, 20).y).toBeLessThan(50);
    expect(framingAfterDrag(wideFrame, start, 0, -20).y).toBeGreaterThan(50);
  });

  it("tracks one-to-one: a drag of the full travel spans the full range", () => {
    // 40px of travel is 100% of the range, so 20px is 50 percentage points.
    expect(framingAfterDrag(wideFrame, start, 0, 20).y).toBeCloseTo(0, 5);
  });

  it("leaves an axis with no travel untouched rather than clamping it", () => {
    // Clamping a dead axis would silently reset a framing already chosen.
    expect(framingAfterDrag(wideFrame, { x: 33, y: 50 }, 100, 0).x).toBe(33);
  });

  it("clamps to 0-100 at the extremes", () => {
    expect(framingAfterDrag(wideFrame, start, 0, 9999).y).toBe(0);
    expect(framingAfterDrag(wideFrame, start, 0, -9999).y).toBe(100);
  });

  it("moves less per pixel when zoomed in", () => {
    const plain = framingAfterDrag(wideFrame, start, 0, 10).y;
    const zoomed = framingAfterDrag({ ...wideFrame, zoom: 2 }, start, 0, 10).y;
    // Same gesture, smaller change — because the magnified image travels
    // further on screen for the same movement of the source.
    expect(50 - zoomed).toBeLessThan(50 - plain);
  });

  it("moves both axes at once when both have travel", () => {
    const next = framingAfterDrag({ ...wideFrame, zoom: 2 }, start, 20, 20);
    expect(next.x).not.toBe(50);
    expect(next.y).not.toBe(50);
  });
});

describe("focalStyle", () => {
  it("anchors the zoom to the same point it positions", () => {
    const style = focalStyle({ x: 30, y: 20 }, 150);
    expect(style.objectPosition).toBe("30% 20%");
    expect(style.transformOrigin).toBe("30% 20%");
    expect(style.transform).toBe("scale(1.5)");
  });

  it("keeps the zoom anchored to the subject at every zoom level", () => {
    // Anchor and position must stay equal or zooming drifts away from the
    // point that was marked, which is the one thing it must not do.
    for (const zoom of [100, 125, 200, 300]) {
      const style = focalStyle({ x: 18, y: 73 }, zoom);
      expect(style.transformOrigin).toBe(style.objectPosition);
    }
  });

  it("emits the marked point unchanged, so every frame anchors identically", () => {
    // The premise of storing one value: it takes no ratio, so the tile, the
    // hover card and the hero cannot disagree about what it means. The band
    // each of them shows is then guaranteed to contain it.
    const focal = { x: 18, y: 73 };
    expect(focalStyle(focal, 100).objectPosition).toBe("18% 73%");
    for (const frame of [LANDSCAPE_TILE, PORTRAIT_TILE, HERO]) {
      const band = visibleBand(focal, STILL, frame);
      expect(band.x.start).toBeLessThanOrEqual(0.18);
      expect(band.x.end).toBeGreaterThanOrEqual(0.18);
      expect(band.y.start).toBeLessThanOrEqual(0.73);
      expect(band.y.end).toBeGreaterThanOrEqual(0.73);
    }
  });
});

describe("visibleBand", () => {
  it("keeps the focal point in frame at every shape a thumbnail is drawn at", () => {
    // The invariant the feature rests on. start = p(1 - size) is never above
    // p, and end = start + size is never below it, whatever the ratio.
    for (const frame of [LANDSCAPE_TILE, PORTRAIT_TILE, HERO]) {
      for (const point of [0, 12, 50, 88, 100]) {
        const band = visibleBand({ x: point, y: point }, STILL, frame);
        expect(band.x.start).toBeLessThanOrEqual(point / 100 + 1e-9);
        expect(band.x.end).toBeGreaterThanOrEqual(point / 100 - 1e-9);
        expect(band.y.start).toBeLessThanOrEqual(point / 100 + 1e-9);
        expect(band.y.end).toBeGreaterThanOrEqual(point / 100 - 1e-9);
      }
    }
  });

  it("crops a wide still horizontally in both tile shapes", () => {
    // Which is why the vertical axis is dead in both, and why framing against
    // either one could never set the hero.
    for (const tile of [LANDSCAPE_TILE, PORTRAIT_TILE]) {
      const band = visibleBand({ x: 50, y: 50 }, STILL, tile);
      expect(band.x.end - band.x.start).toBeLessThan(1);
      expect(band.y.end - band.y.start).toBeCloseTo(1, 10);
    }
  });

  it("crops the same still vertically in the hero, where the tiles never do", () => {
    const band = visibleBand({ x: 50, y: 50 }, STILL, HERO);
    expect(band.y.end - band.y.start).toBeLessThan(1);
    expect(band.x.end - band.x.start).toBeCloseTo(1, 10);
  });

  it("crops harder the further the frame is from the source shape", () => {
    const landscape = visibleBand({ x: 50, y: 50 }, STILL, LANDSCAPE_TILE);
    const portrait = visibleBand({ x: 50, y: 50 }, STILL, PORTRAIT_TILE);
    expect(portrait.x.end - portrait.x.start).toBeLessThan(landscape.x.end - landscape.x.start);
  });

  it("pins the band to an edge at the extremes", () => {
    expect(visibleBand({ x: 0, y: 50 }, STILL, PORTRAIT_TILE).x.start).toBeCloseTo(0, 10);
    expect(visibleBand({ x: 100, y: 50 }, STILL, PORTRAIT_TILE).x.end).toBeCloseTo(1, 10);
  });

  it("centres the band when the point is centred", () => {
    const band = visibleBand({ x: 50, y: 50 }, STILL, PORTRAIT_TILE);
    expect(band.x.start + band.x.end).toBeCloseTo(1, 10);
  });

  it("shows less of the source as the zoom rises", () => {
    const plain = visibleBand({ x: 50, y: 50 }, STILL, LANDSCAPE_TILE, 100);
    const zoomed = visibleBand({ x: 50, y: 50 }, STILL, LANDSCAPE_TILE, 200);
    expect(zoomed.x.end - zoomed.x.start).toBeLessThan(plain.x.end - plain.x.start);
    expect(zoomed.y.end - zoomed.y.start).toBeLessThan(plain.y.end - plain.y.start);
  });

  it("shows the whole image rather than NaN before the size is known", () => {
    expect(visibleBand({ x: 50, y: 50 }, 0, LANDSCAPE_TILE)).toEqual({
      x: { start: 0, end: 1 },
      y: { start: 0, end: 1 },
    });
  });
});
