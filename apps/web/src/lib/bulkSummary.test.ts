// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { plural, summariseBulk } from "./bulkSummary";

describe("plural", () => {
  it("keeps the singular at one", () => {
    expect(plural(1, "item")).toBe("1 item");
  });

  it("pluralises everything else, zero included", () => {
    expect(plural(0, "item")).toBe("0 items");
    expect(plural(2, "item")).toBe("2 items");
  });
});

describe("summariseBulk", () => {
  it("reports only the count on a clean run", () => {
    expect(summariseBulk({ ok: 5, failed: 0, skipped: 0 }, "Tagged")).toBe(
      "Tagged 5 items",
    );
  });

  it("mentions skips, which are not failures", () => {
    expect(summariseBulk({ ok: 2, failed: 0, skipped: 3 }, "Tagged")).toBe(
      "Tagged 2 items · 3 already had it",
    );
  });

  it("mentions failures", () => {
    expect(summariseBulk({ ok: 4, failed: 1, skipped: 0 }, "Added")).toBe(
      "Added 4 items · 1 item failed",
    );
  });

  it("mentions both, in a fixed order", () => {
    expect(summariseBulk({ ok: 1, failed: 2, skipped: 3 }, "Tagged")).toBe(
      "Tagged 1 item · 3 already had it · 2 items failed",
    );
  });

  // The case that reads worst if it is written carelessly: nothing changed,
  // because every selected item was already tagged.
  it("still leads with the count when nothing changed", () => {
    expect(summariseBulk({ ok: 0, failed: 0, skipped: 4 }, "Tagged")).toBe(
      "Tagged 0 items · 4 already had it",
    );
  });

  it("handles a run where everything failed", () => {
    expect(summariseBulk({ ok: 0, failed: 3, skipped: 0 }, "Tagged")).toBe(
      "Tagged 0 items · 3 items failed",
    );
  });
});
