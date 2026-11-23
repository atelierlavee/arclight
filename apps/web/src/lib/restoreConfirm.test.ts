// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { restoreConfirmMatches, restoreConfirmPhrase } from "./restoreConfirm";

describe("restore confirmation", () => {
  const name = "media-server-2026-09-12T16-07-31.918Z.tar.gz";

  it("asks for the archive's own date", () => {
    expect(restoreConfirmPhrase(name)).toBe("2026-09-12");
  });

  it("distinguishes two archives taken on different days", () => {
    // The point of the exercise: if every archive asked for the same phrase,
    // typing it would confirm nothing about which one you picked.
    expect(restoreConfirmPhrase("media-server-2026-01-02T03-04-05.000Z.tar.gz")).not.toBe(
      restoreConfirmPhrase(name),
    );
  });

  it("falls back to the whole name rather than accepting anything", () => {
    expect(restoreConfirmPhrase("odd-name.tar.gz")).toBe("odd-name.tar.gz");
    expect(restoreConfirmMatches("odd-name.tar.gz", "")).toBe(false);
  });

  it("accepts the date with stray whitespace, and nothing else", () => {
    expect(restoreConfirmMatches(name, "  2026-09-12 ")).toBe(true);
    expect(restoreConfirmMatches(name, "2026-09-13")).toBe(false);
    expect(restoreConfirmMatches(name, "")).toBe(false);
  });
});
