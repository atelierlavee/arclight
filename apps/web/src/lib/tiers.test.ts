// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { boardFrom, boardPayload, moveEntry, type Tier, type TierEntry } from "./tiers";

const e = (id: number): TierEntry => ({ id, name: `P${id}` });
const ranked = (id: number, tier: Tier) => ({ ...e(id), tier });

const start = boardFrom([ranked(1, "S"), ranked(2, "S"), ranked(3, "B")], [e(4), e(5)]);
const ids = (list: TierEntry[]) => list.map((entry) => entry.id);

describe("tier board", () => {
  it("builds rows from the server's ranked list", () => {
    expect(ids(start.rows.S)).toEqual([1, 2]);
    expect(ids(start.rows.B)).toEqual([3]);
    expect(ids(start.pool)).toEqual([4, 5]);
  });

  it("moves from the pool into a tier, at the end or before a tile", () => {
    expect(ids(moveEntry(start, 4, "S").rows.S)).toEqual([1, 2, 4]);
    expect(ids(moveEntry(start, 4, "S", 2).rows.S)).toEqual([1, 4, 2]);
    expect(ids(moveEntry(start, 4, "S").pool)).toEqual([5]);
  });

  it("reorders within a tier, and moves between tiers", () => {
    expect(ids(moveEntry(start, 2, "S", 1).rows.S)).toEqual([2, 1]);
    const moved = moveEntry(start, 1, "B", 3);
    expect(ids(moved.rows.S)).toEqual([2]);
    expect(ids(moved.rows.B)).toEqual([1, 3]);
  });

  it("unranks back to the pool, and ignores an unknown id", () => {
    expect(ids(moveEntry(start, 3, "pool").pool)).toEqual([4, 5, 3]);
    expect(moveEntry(start, 99, "S")).toBe(start);
  });

  it("leaves the original board untouched", () => {
    moveEntry(start, 4, "S");
    expect(ids(start.rows.S)).toEqual([1, 2]);
  });

  it("serialises to each tier's ids in order", () => {
    expect(boardPayload(start)).toEqual({ S: [1, 2], A: [], B: [3], C: [], D: [] });
  });
});
