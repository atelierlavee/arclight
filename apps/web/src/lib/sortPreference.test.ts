// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readSortPreference, writeSortPreference } from "./sortPreference";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("remembering a sort", () => {
  it("gives back the fallback when nothing has been chosen", () => {
    expect(readSortPreference("library", "newest")).toBe("newest");
  });

  it("gives back what was chosen", () => {
    writeSortPreference("library", "released");
    expect(readSortPreference("library", "newest")).toBe("released");
  });

  // The whole point of a scope: reading one performer's back catalogue oldest
  // first should not turn the library into an archive view.
  it("keeps each surface's choice apart", () => {
    writeSortPreference("library", "newest");
    writeSortPreference("performer", "releasedOldest");

    expect(readSortPreference("library", "newest")).toBe("newest");
    expect(readSortPreference("performer", "newest")).toBe("releasedOldest");
  });

  it("does not disturb the other scope when one is written", () => {
    writeSortPreference("performer", "title");
    writeSortPreference("library", "longest");

    expect(readSortPreference("performer", "newest")).toBe("title");
  });

  // Storage outlives the build that wrote it. A sort dropped in a later
  // release would otherwise be sent to a server that no longer accepts it,
  // which falls through to the default order while the control claims
  // something else.
  it("ignores a stored sort this build no longer has", () => {
    localStorage.setItem("sort-preference", JSON.stringify({ library: "by-vibes" }));
    expect(readSortPreference("library", "newest")).toBe("newest");
  });

  it("ignores a stored value that is not an object", () => {
    localStorage.setItem("sort-preference", '"newest"');
    expect(readSortPreference("library", "title")).toBe("title");
  });

  it("survives unparseable storage", () => {
    localStorage.setItem("sort-preference", "{not json");
    expect(readSortPreference("library", "newest")).toBe("newest");
  });

  it("refuses to store a value that is not a real sort", () => {
    writeSortPreference("library", "by-vibes" as never);
    expect(localStorage.getItem("sort-preference")).toBeNull();
  });

  // Private windows and blocked site data throw on access. Losing the
  // preference is survivable; throwing during render white-screens the app.
  it("does not throw when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(() => writeSortPreference("library", "title")).not.toThrow();
    expect(readSortPreference("library", "newest")).toBe("newest");
  });
});
