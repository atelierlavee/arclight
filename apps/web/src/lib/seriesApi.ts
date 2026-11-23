// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

export type SeriesSummary = {
  id: number;
  name: string;
  representativeItemId: number | null;
  episodeCount: number;
  unwatched: number;
};

export type SeriesEpisode = {
  id: number;
  title: string;
  episodeTitle: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  durationSeconds: number | null;
  thumbnailFile: string | null;
  completedAt: string | null;
  lastPositionSeconds: number | null;
};

export type SeriesDetail = {
  id: number;
  name: string;
  seasons: { number: number; episodes: SeriesEpisode[] }[];
};

export async function fetchSeries(): Promise<{ series: SeriesSummary[] }> {
  const response = await fetch("/api/series");
  if (!response.ok) throw new Error(`Failed to load series: ${response.status}`);
  return response.json();
}

export async function fetchSeriesDetail(id: number): Promise<SeriesDetail> {
  const response = await fetch(`/api/series/${id}`);
  if (!response.ok) throw new Error(`Failed to load series: ${response.status}`);
  return response.json();
}

export async function createSeries(name: string, mediaItemId: number): Promise<SeriesSummary> {
  const response = await fetch("/api/series", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mediaItemId }),
  });
  if (!response.ok) throw new Error(`Failed to create series: ${response.status}`);
  return response.json();
}
