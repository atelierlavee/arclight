// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import type { ScrubSprite } from "./bookmarkApi";

export type Frame = {
  /** Index of the cell in the sprite. */
  index: number;
  /** Where the frame sits in the video, in seconds. */
  seconds: number;
  /** Up to where this tile stands for — the next tile's start, or the end. */
  untilSeconds: number;
};

/**
 * Picks `wanted` frames spread evenly across the sheet's `count`, always
 * keeping the first. With wanted ≥ count it is every frame.
 */
export function pickFrames(sprite: ScrubSprite, wanted: number, duration: number): Frame[] {
  const total = sprite.count;
  const n = Math.max(1, Math.min(total, Number.isFinite(wanted) ? wanted : total));
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const index = Math.floor((i * total) / n);
    if (indices[indices.length - 1] !== index) indices.push(index);
  }
  // A frame is grabbed from the middle of its interval (scrubSprite.ts), so
  // jumping to the interval's start shows the moment just before it.
  const end = duration > 0 ? duration : total * sprite.interval;
  return indices.map((index, i) => ({
    index,
    seconds: Math.min(end, index * sprite.interval),
    untilSeconds: Math.min(end, (indices[i + 1] ?? total) * sprite.interval),
  }));
}
