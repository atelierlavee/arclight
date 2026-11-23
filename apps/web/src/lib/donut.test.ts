// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { foldSlices } from "./donut";

const slice = (name: string, value: number) => ({ name, value });

describe("foldSlices", () => {
  it("keeps a short list as it is, biggest first", () => {
    expect(foldSlices([slice("a", 1), slice("b", 3)])).toEqual([slice("b", 3), slice("a", 1)]);
  });

  it("keeps five named slices and folds the rest, so no colour repeats", () => {
    const folded = foldSlices([6, 5, 4, 3, 2, 1].map((v) => slice(`s${v}`, v)));
    expect(folded.map((s) => s.name)).toEqual(["s6", "s5", "s4", "s3", "s2", "Everything else"]);
    expect(folded.at(-1)?.value).toBe(1);
  });

  it("merges a tail that was already folded instead of drawing two", () => {
    const folded = foldSlices([slice("Everything else", 50), slice("a", 10), slice("b", 5)]);
    expect(folded).toEqual([slice("a", 10), slice("b", 5), slice("Everything else", 50)]);
  });

  it("drops empty slices", () => {
    expect(foldSlices([slice("a", 0), slice("b", 2)])).toEqual([slice("b", 2)]);
  });
});
