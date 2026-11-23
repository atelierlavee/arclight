// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { chunkIntoRows, columnsForWidth, columnWidthFor } from "./gridLayout";

describe("columnsForWidth", () => {
  it("fits whole tiles, counting the gaps between them", () => {
    // Three 200px tiles plus two 16px gaps is 632px.
    expect(columnsForWidth(632, 200, 16)).toBe(3);
    // One pixel short of a fourth tile+gap is still three.
    expect(columnsForWidth(847, 200, 16)).toBe(3);
    expect(columnsForWidth(848, 200, 16)).toBe(4);
  });

  it("never drops below one column, however narrow", () => {
    expect(columnsForWidth(50, 200, 16)).toBe(1);
  });

  it("survives the unmeasured first pass rather than dividing by zero", () => {
    expect(columnsForWidth(0, 200, 16)).toBe(1);
    expect(columnsForWidth(800, 0, 16)).toBe(1);
  });
});

describe("columnWidthFor", () => {
  it("splits the leftover space after the gaps", () => {
    expect(columnWidthFor(632, 3, 16)).toBe(200);
  });

  it("gives a single column the whole width", () => {
    expect(columnWidthFor(400, 1, 16)).toBe(400);
  });

  it("never reports a negative width", () => {
    expect(columnWidthFor(10, 5, 16)).toBe(0);
  });
});

describe("chunkIntoRows", () => {
  it("fills rows in order, leaving the last one short", () => {
    expect(chunkIntoRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("has no rows when there is nothing to place", () => {
    expect(chunkIntoRows([], 3)).toEqual([]);
  });

  it("treats a zero column count as one, rather than looping forever", () => {
    expect(chunkIntoRows([1, 2], 0)).toEqual([[1], [2]]);
  });
});
