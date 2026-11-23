// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { HOME_ROWS, readHomeRows, type HomeRowSetting } from "./appearance";

// Widened to string: these assertions deliberately include keys this build
// does not have, which is the case the reconciliation exists to handle.
const keys = (rows: HomeRowSetting[]): string[] =>
  rows.map((row) => row.key);
const stored = (...names: string[]) =>
  names.map((key) => ({ key, visible: true }));

describe("readHomeRows", () => {
  it("gives a fresh install every row, in the designed order", () => {
    expect(keys(readHomeRows(undefined))).toEqual(
      HOME_ROWS.map((row) => row.key),
    );
  });

  it("shows a short home by default, with the rest switched off", () => {
    const visible = keys(readHomeRows(undefined).filter((row) => row.visible));
    expect(visible).toContain("continue");
    expect(visible).toContain("following");
    expect(visible).not.toContain("tags");
    expect(visible).not.toContain("collections");
    expect(visible.length).toBeLessThan(10);
  });

  it("gives an untouched old default the new short one", () => {
    // Every row on but the streak, in the built-in order: the old default
    // saved back by an unrelated appearance change.
    // (The streak has since left Home, but old saved lists still carry it.)
    const legacy = [
      { key: "streak", visible: false },
      ...HOME_ROWS.map((row) => ({ key: row.key, visible: true })),
    ];
    expect(readHomeRows(legacy)).toEqual(readHomeRows(undefined));
  });

  it("keeps a home you customised, even with every row on", () => {
    const reordered = [{ key: "tags", visible: true }, { key: "continue", visible: true }];
    expect(readHomeRows(reordered).find((row) => row.key === "tags")?.visible).toBe(true);
    const oneHidden = HOME_ROWS.map((row) => ({ key: row.key, visible: row.key !== "favourites" }));
    expect(readHomeRows(oneHidden).find((row) => row.key === "tags")?.visible).toBe(true);
  });

  it("keeps the order you arranged", () => {
    const order = readHomeRows(stored("tags", "dailyPick", "continue"));
    // The three stored rows keep their relative order, whatever else lands
    // between them.
    const positions = ["tags", "dailyPick", "continue"].map((key) =>
      keys(order).indexOf(key),
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("keeps the rows you hid hidden", () => {
    const order = readHomeRows([
      { key: "dailyPick", visible: false },
      { key: "continue", visible: true },
    ]);
    expect(order.find((row) => row.key === "dailyPick")?.visible).toBe(false);
    expect(order.find((row) => row.key === "continue")?.visible).toBe(true);
  });

  /**
   * The reported bug.
   *
   * New rows used to be appended to the end. `collections` and `tags` each
   * render one row per collection and per tag, so on a real library the end
   * of the list is below twenty rows of content — far enough down that
   * Pinned was reported as simply not being there.
   */
  it("slots a new row into place rather than dumping it at the end", () => {
    // A stored order from before any of the newer rows existed.
    const order = keys(
      readHomeRows(
        stored(
          "dailyPick",
          "continue",
          "favourites",
          "performers",
          "studios",
          "recent",
          "collections",
          "tags",
        ),
      ),
    );

    expect(order.at(-1)).toBe("tags");
    // Pinned belongs above the per-collection and per-tag rows, which is
    // where this build lists it.
    expect(order.indexOf("pinned")).toBeLessThan(order.indexOf("collections"));
    expect(order.indexOf("recentlyWatched")).toBeGreaterThan(
      order.indexOf("recent"),
    );
  });

  it("keeps several new rows in their own relative order", () => {
    const order = keys(readHomeRows(stored("dailyPick", "tags")));
    expect(order.indexOf("recentlyWatched")).toBeLessThan(
      order.indexOf("mostPlayed"),
    );
    expect(order.indexOf("mostPlayed")).toBeLessThan(order.indexOf("pinned"));
  });

  it("puts a new first row at the front", () => {
    // "dailyPick" leads HOME_ROWS, so a stored order lacking it should get
    // it back at the top rather than wherever there was room.
    expect(keys(readHomeRows(stored("tags")))[0]).toBe("dailyPick");
  });

  it("drops keys this build no longer has", () => {
    const order = keys(readHomeRows(stored("dailyPick", "cinematicRow")));
    expect(order).not.toContain("cinematicRow");
    expect(order).toContain("dailyPick");
  });

  it("ignores a duplicate rather than showing the row twice", () => {
    const order = keys(readHomeRows(stored("dailyPick", "dailyPick")));
    expect(order.filter((key) => key === "dailyPick")).toHaveLength(1);
  });

  it("returns every row exactly once, whatever it is given", () => {
    for (const input of [
      undefined,
      [],
      stored("tags"),
      stored("tags", "dailyPick", "nonsense"),
    ]) {
      const order = keys(readHomeRows(input));
      expect(new Set(order).size).toBe(HOME_ROWS.length);
    }
  });
});
