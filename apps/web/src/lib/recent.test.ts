// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRecent,
  readRecent,
  readRecentlyInteracted,
  recordRecent,
} from "./recent";

beforeEach(() => localStorage.clear());

const item = (id: number, title = `Item ${id}`) => ({ id, title });

describe("recordRecent", () => {
  it("puts the newest interaction first", () => {
    recordRecent("browsed", item(1));
    recordRecent("browsed", item(2));
    expect(readRecent("browsed").map((e) => e.id)).toEqual([2, 1]);
  });

  // Opening the same video six times should not fill the row with six copies.
  it("moves a repeat to the front rather than duplicating it", () => {
    recordRecent("browsed", item(1));
    recordRecent("browsed", item(2));
    recordRecent("browsed", item(1));
    expect(readRecent("browsed").map((e) => e.id)).toEqual([1, 2]);
  });

  it("keeps the kinds apart", () => {
    recordRecent("browsed", item(1));
    recordRecent("played", item(2));
    expect(readRecent("browsed").map((e) => e.id)).toEqual([1]);
    expect(readRecent("played").map((e) => e.id)).toEqual([2]);
  });

  it("caps the history rather than growing without bound", () => {
    for (let i = 0; i < 60; i++) recordRecent("browsed", item(i));
    expect(readRecent("browsed")).toHaveLength(40);
    // The cap drops the oldest, not the newest.
    expect(readRecent("browsed")[0].id).toBe(59);
  });

  it("survives corrupt storage rather than throwing", () => {
    localStorage.setItem("recent-browsed", "{not json");
    expect(readRecent("browsed")).toEqual([]);
    recordRecent("browsed", item(1));
    expect(readRecent("browsed").map((e) => e.id)).toEqual([1]);
  });

  it("does not throw when storage is unavailable", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceeded");
      });
    expect(() => recordRecent("browsed", item(1))).not.toThrow();
    setItem.mockRestore();
  });

  it("clears one kind without touching the others", () => {
    recordRecent("browsed", item(1));
    recordRecent("played", item(2));
    clearRecent("browsed");
    expect(readRecent("browsed")).toEqual([]);
    expect(readRecent("played")).toHaveLength(1);
  });
});

describe("readRecentlyInteracted", () => {
  // These all land in the same millisecond, which is the point: the ordering
  // has to come from the write order rather than from the clock's
  // resolution, or the merge depends on which kind is read first.
  it("merges the kinds, newest first", () => {
    recordRecent("browsed", item(1));
    recordRecent("played", item(2));
    recordRecent("edited", item(3));
    expect(readRecentlyInteracted().map((e) => e.id)).toEqual([3, 2, 1]);
  });

  // An item played and then favourited is one thing you worked with, not two.
  it("shows an item once, at its most recent interaction", () => {
    recordRecent("played", item(1));
    recordRecent("favourited", item(1));
    recordRecent("browsed", item(2));

    const merged = readRecentlyInteracted();
    expect(merged.filter((e) => e.id === 1)).toHaveLength(1);
    expect(merged.map((e) => e.id)).toEqual([2, 1]);
  });

  it("is empty when nothing has been touched", () => {
    expect(readRecentlyInteracted()).toEqual([]);
  });
});
