// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { previewSegmentOffsets } from "./preview.js";

describe("previewSegmentOffsets", () => {
  it("returns a single zero offset when the duration is unknown", () => {
    // The poster still has to come from somewhere, so this can never be empty.
    expect(previewSegmentOffsets(null)).toEqual([0]);
    expect(previewSegmentOffsets(0)).toEqual([0]);
    expect(previewSegmentOffsets(-5)).toEqual([0]);
  });

  it("samples six segments across a full-length video", () => {
    expect(previewSegmentOffsets(3600)).toHaveLength(6);
  });

  it("starts inside the sampling window rather than at the very beginning", () => {
    // Opening titles and studio idents make the first frames useless.
    const [first] = previewSegmentOffsets(1000);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeCloseTo(180, 0);
  });

  it("keeps every segment inside the video", () => {
    const duration = 1000;
    for (const offset of previewSegmentOffsets(duration)) {
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(duration);
    }
  });

  it("finishes the last segment before the window ends", () => {
    const duration = 1000;
    const offsets = previewSegmentOffsets(duration);
    const SEGMENT_SECONDS = 2.5;
    const WINDOW_END = duration * 0.9;
    expect(offsets[offsets.length - 1] + SEGMENT_SECONDS).toBeLessThanOrEqual(WINDOW_END + 0.01);
  });

  it("returns offsets in ascending order with no duplicates", () => {
    const offsets = previewSegmentOffsets(600);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    expect(new Set(offsets).size).toBe(offsets.length);
  });

  it("takes fewer segments from a short clip rather than overlapping them", () => {
    // 20s leaves ~14s of window, which fits five 2.5s segments, not six.
    const offsets = previewSegmentOffsets(20);
    expect(offsets.length).toBeGreaterThanOrEqual(1);
    expect(offsets.length).toBeLessThan(6);
  });

  it("degrades to one segment for a very short clip", () => {
    expect(previewSegmentOffsets(4)).toHaveLength(1);
  });
});
