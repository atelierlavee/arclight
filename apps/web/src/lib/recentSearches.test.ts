// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRecentSearches,
  readRecentSearches,
  recordRecentSearch,
} from "./recentSearches";

beforeEach(() => localStorage.clear());

describe("recordRecentSearch", () => {
  it("keeps the newest first", () => {
    recordRecentSearch("beach");
    recordRecentSearch("forest");
    expect(readRecentSearches()).toEqual(["forest", "beach"]);
  });

  it("moves a repeat to the front, ignoring case", () => {
    recordRecentSearch("beach");
    recordRecentSearch("forest");
    recordRecentSearch("BEACH");
    expect(readRecentSearches()).toEqual(["BEACH", "forest"]);
  });

  // Otherwise the list fills with "b", "be", "bea" on the way to "beach".
  it("ignores a query too short to be one", () => {
    recordRecentSearch("b");
    recordRecentSearch("  ");
    expect(readRecentSearches()).toEqual([]);
  });

  it("trims before storing", () => {
    recordRecentSearch("  beach  ");
    expect(readRecentSearches()).toEqual(["beach"]);
  });

  it("caps the list", () => {
    for (const q of ["a1", "b2", "c3", "d4", "e5", "f6", "g7"])
      recordRecentSearch(q);
    expect(readRecentSearches()).toHaveLength(6);
    expect(readRecentSearches()[0]).toBe("g7");
  });

  it("returns the updated list, so a caller needn't re-read", () => {
    expect(recordRecentSearch("beach")).toEqual(["beach"]);
  });

  it("survives corrupt storage", () => {
    localStorage.setItem("recent-searches", "{not json");
    expect(readRecentSearches()).toEqual([]);
  });

  it("clears", () => {
    recordRecentSearch("beach");
    clearRecentSearches();
    expect(readRecentSearches()).toEqual([]);
  });
});
