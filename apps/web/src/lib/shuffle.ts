// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

/**
 * Picks an index deterministically from an id and a seed.
 *
 * Used where a list should look shuffled but must not actually be random
 * during render: `Math.random()` in a render pass can hand back a different
 * answer each time React runs it, so a row of pictures could change while
 * you are looking at it. Given the same seed this always returns the same
 * index, and callers reshuffle by changing the seed — the time of the last
 * fetch works well, since it moves exactly when the data does.
 *
 * The mixing is a cheap integer hash. Without it, consecutive ids with the
 * same seed march through the list in step and a row picks frame 0 from the
 * first studio, frame 1 from the next, and so on — visibly a pattern rather
 * than a shuffle.
 */
export function pickIndex(id: number, seed: number, length: number): number {
  if (length <= 0) return 0;
  return seededRank(id, seed) % length;
}

/**
 * A stable pseudo-random number for an id under a seed.
 *
 * Sort by this to shuffle a list without shuffling it: the order holds for as
 * long as the seed does, so a row does not rearrange itself under the pointer
 * on an unrelated re-render, and changing the seed deals a new order.
 */
export function seededRank(id: number, seed: number): number {
  let hash = Math.imul(id, 2654435761) ^ Math.imul(seed, 40503);
  hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash ^ (hash >>> 16)) >>> 0;
}
