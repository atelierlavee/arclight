// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import path from "node:path";
import { describe, expect, it } from "vitest";
import * as cache from "./cache.js";
import { APP_DATA_DIRS, DERIVED_DIRS, UPLOAD_DIRS } from "./cache.js";

/**
 * Guards the classification, not the contents.
 *
 * `kind-covers` was declared here and missing from the backup's own copy of
 * the list, so category covers were never archived — noticed only by going
 * looking. These assertions are what would have failed instead.
 */
describe("app data directories", () => {
  it("classifies every directory as either an upload or derived", () => {
    // The guard. A new `*_DIR` export that nobody decided about fails here,
    // rather than being quietly left out of backups.
    const exported = Object.entries(cache)
      .filter(([name, value]) => name.endsWith("_DIR") && typeof value === "string")
      .map(([name, value]) => [name, value as string] as const);

    expect(exported.length).toBeGreaterThan(0);

    for (const [name, dir] of exported) {
      const matches = APP_DATA_DIRS.filter((entry) => entry.dir === dir);
      expect(
        matches.length,
        `${name} is not in UPLOAD_DIRS or DERIVED_DIRS — decide whether losing it matters`,
      ).toBe(1);
    }
  });

  it("never counts a directory as both backed up and regenerable", () => {
    const uploads = new Set(UPLOAD_DIRS.map((entry) => entry.dir));
    for (const derived of DERIVED_DIRS) {
      expect(uploads.has(derived.dir)).toBe(false);
    }
    expect(APP_DATA_DIRS).toHaveLength(UPLOAD_DIRS.length + DERIVED_DIRS.length);
  });

  // Named explicitly: this is the one that was missing, and a rename or a
  // tidy-up that dropped it would put the same hole back.
  it("backs up the category and kind covers", () => {
    expect(UPLOAD_DIRS.map((entry) => entry.name)).toContain("kind-covers");
  });

  it("backs up everything a user uploads, and nothing it can rebuild", () => {
    expect(UPLOAD_DIRS.map((entry) => entry.name).sort()).toEqual([
      "item-thumbnails",
      "kind-covers",
      "performer-images",
    ]);
    expect(DERIVED_DIRS.map((entry) => entry.name).sort()).toEqual([
      "posters",
      "previews",
      "scrub-sprites",
      "thumbnails",
    ]);
  });

  // `name` becomes a path inside the archive and the folder restore.sh copies
  // back, so a duplicate would overwrite and a mismatch would restore to the
  // wrong place.
  it("gives each directory a unique name matching its folder", () => {
    const names = APP_DATA_DIRS.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);

    for (const entry of APP_DATA_DIRS) {
      expect(path.basename(entry.dir)).toBe(entry.name);
      expect(entry.name).not.toContain("/");
    }
  });
});
