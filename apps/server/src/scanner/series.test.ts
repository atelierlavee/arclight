// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { parseSeriesEpisode } from "./series.js";

describe("parseSeriesEpisode", () => {
  it("parses a season and episode from a season folder", () => {
    expect(
      parseSeriesEpisode("/library/Show Name/Season 1/S01E02 - The Return.mp4")
    ).toEqual({
      name: "Show Name",
      seasonNumber: 1,
      episodeNumber: 2,
      episodeTitle: "The Return",
    });
  });

  it("uses the containing folder when there is no season folder", () => {
    expect(parseSeriesEpisode("/library/Show Name/S02E03 Finale.mp4")).toEqual({
      name: "Show Name",
      seasonNumber: 2,
      episodeNumber: 3,
      episodeTitle: "Finale",
    });
  });

  it("ignores regular filenames", () => {
    expect(parseSeriesEpisode("/library/Show Name/episode.mp4")).toBeNull();
  });
});
