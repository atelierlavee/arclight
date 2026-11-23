// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { pickIndex, seededRank } from "./shuffle";

describe("pickIndex", () => {
  it("always lands inside the list", () => {
    for (let id = 0; id < 200; id++) {
      for (const length of [1, 2, 8, 37]) {
        const index = pickIndex(id, 1739000000000, length);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(length);
      }
    }
  });

  it("gives the same answer for the same id and seed", () => {
    expect(pickIndex(42, 99, 8)).toBe(pickIndex(42, 99, 8));
  });

  it("gives a different spread when the seed moves", () => {
    const before = Array.from({ length: 40 }, (_, id) => pickIndex(id, 1, 8));
    const after = Array.from({ length: 40 }, (_, id) => pickIndex(id, 2, 8));
    expect(after).not.toEqual(before);
  });

  // The failure this guards against is a row that looks ordered rather than
  // shuffled: neighbouring ids walking through the list one step at a time.
  it("does not march consecutive ids through the list in step", () => {
    const picks = Array.from({ length: 12 }, (_, id) => pickIndex(id, 7, 8));
    const marching = picks.every(
      (value, i) => i === 0 || value === (picks[i - 1] + 1) % 8,
    );
    expect(marching).toBe(false);
  });

  it("survives a zero-length list rather than returning NaN", () => {
    expect(pickIndex(5, 7, 0)).toBe(0);
  });

  it("never returns a negative index, whatever the ids", () => {
    for (const id of [-1, -9999, 0, Number.MAX_SAFE_INTEGER]) {
      expect(pickIndex(id, -12345, 5)).toBeGreaterThanOrEqual(0);
    }
  });
});


describe("seededRank", () => {
  const order = (ids: number[], seed: number) =>
    [...ids].sort((a, b) => seededRank(a, seed) - seededRank(b, seed));

  it("holds the same order for the same seed", () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(order(ids, 99)).toEqual(order(ids, 99));
  });

  it("deals a different order when the seed moves", () => {
    const ids = Array.from({ length: 24 }, (_, i) => i + 1);
    expect(order(ids, 1)).not.toEqual(order(ids, 2));
  });

  it("does not just reproduce the original order", () => {
    const ids = Array.from({ length: 24 }, (_, i) => i + 1);
    expect(order(ids, 7)).not.toEqual(ids);
  });

  it("is always a non-negative number, so sorting is well defined", () => {
    for (const id of [-5000, -1, 0, 7, Number.MAX_SAFE_INTEGER]) {
      expect(seededRank(id, -3)).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(seededRank(id, -3))).toBe(true);
    }
  });
});
