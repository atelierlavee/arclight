// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { suggestedFilename } from "./suggestedFilename";

const base = { studio: "X-Art", performers: ["Little Caprice"], date: "2018-12-25", title: "Once A Year", currentName: "a.mp4" };

describe("suggestedFilename", () => {
  it("builds the full convention, keeping the file's extension", () => {
    expect(suggestedFilename(base)).toBe("[X-Art] Little Caprice - 12.25.2018 - Once A Year.mp4");
    expect(suggestedFilename({ ...base, currentName: "movie.MKV" })).toBe(
      "[X-Art] Little Caprice - 12.25.2018 - Once A Year.MKV",
    );
  });

  it("lists several performers with commas", () => {
    expect(suggestedFilename({ ...base, performers: ["Ann", "Bea"] })).toBe(
      "[X-Art] Ann, Bea - 12.25.2018 - Once A Year.mp4",
    );
  });

  it("leaves out what is unknown instead of guessing", () => {
    expect(suggestedFilename({ ...base, date: null })).toBe("[X-Art] Little Caprice - Once A Year.mp4");
    expect(suggestedFilename({ ...base, performers: [] })).toBe("[X-Art] - 12.25.2018 - Once A Year.mp4");
    expect(suggestedFilename({ ...base, performers: [], date: null })).toBe("[X-Art] - Once A Year.mp4");
  });

  it("needs a studio and a title", () => {
    expect(suggestedFilename({ ...base, studio: null })).toBeNull();
    expect(suggestedFilename({ ...base, studio: "  " })).toBeNull();
    expect(suggestedFilename({ ...base, title: "" })).toBeNull();
  });

  it("removes characters a filesystem refuses and the format's own separators", () => {
    expect(suggestedFilename({ ...base, title: 'Who? "Me": a/b', performers: ["Ann - Bea"] })).toBe(
      "[X-Art] Ann Bea - 12.25.2018 - Who Me a b.mp4",
    );
    expect(suggestedFilename({ ...base, studio: "[Bad] Name" })).toBe(
      "[Bad Name] Little Caprice - 12.25.2018 - Once A Year.mp4",
    );
  });

  it("keeps dashes that belong to a title", () => {
    expect(suggestedFilename({ ...base, title: "Girls - Girls - Girls" })).toBe(
      "[X-Art] Little Caprice - 12.25.2018 - Girls - Girls - Girls.mp4",
    );
  });
});
