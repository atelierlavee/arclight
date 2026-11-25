// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { nextEpisodeInSeries, type SeriesDetail } from "./seriesApi";

const series: SeriesDetail = {
  id: 4,
  name: "Test series",
  seasons: [
    {
      number: 1,
      episodes: [
        {
          id: 10,
          title: "Episode 1",
          episodeTitle: null,
          seasonNumber: 1,
          episodeNumber: 1,
          durationSeconds: 30,
          thumbnailFile: null,
          completedAt: null,
          lastPositionSeconds: null,
        },
      ],
    },
    {
      number: 2,
      episodes: [
        {
          id: 11,
          title: "Episode 2",
          episodeTitle: null,
          seasonNumber: 2,
          episodeNumber: 1,
          durationSeconds: 30,
          thumbnailFile: null,
          completedAt: null,
          lastPositionSeconds: null,
        },
      ],
    },
  ],
};

describe("nextEpisodeInSeries", () => {
  it("finds the next episode across season boundaries", () => {
    expect(nextEpisodeInSeries(series, 10)?.id).toBe(11);
  });

  it("returns no next episode for the last or an unknown episode", () => {
    expect(nextEpisodeInSeries(series, 11)).toBeNull();
    expect(nextEpisodeInSeries(series, 99)).toBeNull();
  });
});
