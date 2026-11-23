// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it } from "vitest";
import {
  readSavedSearches,
  removeSavedSearch,
  saveSearch,
  savedSearchFilters,
  suggestSearchName,
} from "./savedSearches";
import { EMPTY_FILTERS, hasActiveFilters } from "./filters";

beforeEach(() => localStorage.clear());

describe("saveSearch", () => {
  it("stores and reads back a named view", () => {
    saveSearch("Unwatched", "watched=false");
    expect(readSavedSearches().map((entry) => entry.name)).toEqual(["Unwatched"]);
  });

  // Saving the same name twice means updating it. Two rows with the same
  // label in the sidebar help nobody.
  it("replaces a saved search of the same name rather than duplicating it", () => {
    saveSearch("Unwatched", "watched=false");
    saveSearch("unwatched", "watched=false&tags=indoor");
    const all = readSavedSearches();
    expect(all).toHaveLength(1);
    expect(all[0].search).toContain("tags=indoor");
  });

  it("normalises the query string so equivalent views match", () => {
    const a = saveSearch("A", "tags=x&watched=false");
    const b = saveSearch("B", "tags=x&watched=false");
    expect(a.search).toBe(b.search);
  });

  it("newest first, so a just-saved view is at the top", () => {
    saveSearch("First", "tags=a");
    saveSearch("Second", "tags=b");
    expect(readSavedSearches().map((e) => e.name)).toEqual(["Second", "First"]);
  });

  it("deletes by id", () => {
    const entry = saveSearch("Gone", "tags=a");
    removeSavedSearch(entry.id);
    expect(readSavedSearches()).toEqual([]);
  });

  it("survives corrupt storage rather than throwing", () => {
    localStorage.setItem("saved-searches", "{not json");
    expect(readSavedSearches()).toEqual([]);
  });

  it("drops entries that don't have the shape of a saved search", () => {
    localStorage.setItem(
      "saved-searches",
      JSON.stringify([{ name: "no id" }, { id: "1", name: "ok", search: "" }]),
    );
    expect(readSavedSearches().map((e) => e.name)).toEqual(["ok"]);
  });
});

describe("savedSearchFilters", () => {
  it("parses the stored query back into filters", () => {
    const entry = saveSearch("Mixed", "tags=indoor,night&watched=false");
    const filters = savedSearchFilters(entry);
    expect(filters.tags).toEqual(["indoor", "night"]);
    expect(filters.watched).toBe(false);
  });

  // A search saved before a filter existed simply doesn't carry it, rather
  // than carrying a stale snapshot of a shape that has since changed.
  it("ignores parameters that are no longer filters", () => {
    const entry = saveSearch("Old", "somethingRemoved=1");
    const filters = savedSearchFilters(entry);
    expect(hasActiveFilters(filters)).toBe(false);
    expect(filters.tags).toEqual([]);
  });
});

describe("suggestSearchName", () => {
  it("describes what is filtered rather than numbering the view", () => {
    expect(
      suggestSearchName({ ...EMPTY_FILTERS, watched: false, tags: ["indoor"] }),
    ).toBe("Unwatched · indoor");
  });

  it("leads with the text query when there is one", () => {
    expect(suggestSearchName(EMPTY_FILTERS, "beach")).toBe("“beach”");
  });

  it("falls back to a generic name rather than an empty one", () => {
    expect(suggestSearchName(EMPTY_FILTERS)).toBe("Saved view");
  });
});
