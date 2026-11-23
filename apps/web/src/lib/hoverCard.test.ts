// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  EXPANDED_SCALE,
  VIEWPORT_MARGIN,
  flyoutBox,
  hoverCardBox,
  worthExpanding,
} from "./hoverCard";

const VIEW = { width: 1400, height: 900 };

describe("hoverCardBox", () => {
  it("grows a small tile by the full scale", () => {
    const box = hoverCardBox({ left: 500, top: 300, width: 200 }, VIEW);
    expect(box.width).toBe(200 * EXPANDED_SCALE);
  });

  // The reported bug: a near-full-width tile expanded off the screen.
  it("never grows wider than the window", () => {
    const box = hoverCardBox({ left: 0, top: 100, width: 1400 }, VIEW);
    expect(box.width).toBeLessThanOrEqual(VIEW.width - VIEWPORT_MARGIN * 2);
    expect(box.left + box.width).toBeLessThanOrEqual(VIEW.width);
  });

  it("keeps the card on screen from either edge", () => {
    for (const left of [0, 1200, 1399]) {
      const box = hoverCardBox({ left, top: 300, width: 320 }, VIEW);
      expect(box.left).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
      expect(box.left + box.width).toBeLessThanOrEqual(VIEW.width);
    }
  });

  it("keeps a card anchored low from hanging below the fold", () => {
    const box = hoverCardBox({ left: 400, top: 880, width: 320 }, VIEW);
    const height = (box.width * 9) / 16;
    expect(box.top + height).toBeLessThanOrEqual(VIEW.height);
    expect(box.top).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
  });

  it("stays on screen in a window smaller than one tile", () => {
    const tiny = { width: 320, height: 240 };
    const box = hoverCardBox({ left: 0, top: 0, width: 900 }, tiny);
    expect(box.width).toBeLessThanOrEqual(tiny.width);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
  });
});

describe("worthExpanding", () => {
  it("expands an ordinary grid tile", () => {
    expect(worthExpanding(300, 1400)).toBe(true);
  });

  it("refuses a tile that already fills the window", () => {
    expect(worthExpanding(1400, 1400)).toBe(false);
    expect(worthExpanding(900, 1400)).toBe(false);
  });
});


describe("flyoutBox", () => {
  const SIZE = { width: 320, height: 300 };

  it("sits to the right of its tile, clear of it", () => {
    const anchor = { left: 300, top: 200, width: 200, height: 300 };
    const box = flyoutBox(anchor, VIEW, SIZE);
    expect(box.side).toBe("right");
    expect(box.left).toBeGreaterThanOrEqual(anchor.left + anchor.width);
  });

  it("flips left for a tile in the last column", () => {
    const anchor = { left: 1150, top: 200, width: 200, height: 300 };
    const box = flyoutBox(anchor, VIEW, SIZE);
    expect(box.side).toBe("left");
    expect(box.left + SIZE.width).toBeLessThanOrEqual(anchor.left);
  });

  it("never covers the tile it belongs to", () => {
    for (const left of [0, 300, 700, 1150]) {
      const anchor = { left, top: 200, width: 200, height: 300 };
      const box = flyoutBox(anchor, VIEW, SIZE);
      const overlaps =
        box.left < anchor.left + anchor.width && box.left + SIZE.width > anchor.left;
      expect(overlaps, `tile at ${left}px was covered`).toBe(false);
    }
  });

  it("centres on the tile vertically and stays on screen", () => {
    const box = flyoutBox({ left: 300, top: 300, width: 200, height: 300 }, VIEW, SIZE);
    expect(box.top + SIZE.height / 2).toBeCloseTo(450, 0);

    for (const top of [0, 860]) {
      const clamped = flyoutBox({ left: 300, top, width: 200, height: 300 }, VIEW, SIZE);
      expect(clamped.top).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
      expect(clamped.top + SIZE.height).toBeLessThanOrEqual(VIEW.height);
    }
  });

  it("keeps the caret on the card's edge even when clamped away from the tile", () => {
    for (const top of [0, 300, 860]) {
      const box = flyoutBox({ left: 300, top, width: 200, height: 300 }, VIEW, SIZE);
      expect(box.caretTop).toBeGreaterThan(0);
      expect(box.caretTop).toBeLessThan(SIZE.height);
    }
  });
});
