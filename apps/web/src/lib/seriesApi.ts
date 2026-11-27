// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

export type SeriesSummary = {
  id: number;
  name: string;
  representativeItemId: number | null;
  /** The first three episodes, in order, for a stacked cover. */
  coverItemIds?: number[];
  /** An uploaded poster, drawn on top of the stack; null for none. */
  coverFile?: string | null;
  episodeCount: number;
  unwatched: number;
  studios?: string[];
  firstReleased?: string | null;
  lastReleased?: string | null;
  /** Whoever appears in the most of its episodes. */
  lead?: { id: number; name: string } | null;
  /** When this profile last played any of it, and when its newest episode arrived. */
  lastPlayedAt?: string | null;
  newestAddedAt?: string | null;
  /** Each episode's place, in order. */
  episodes?: { id: number; position: number; duration: number | null; completed: boolean }[];
};

/** A likely series not yet made: one studio's numbered parts. */
export type SeriesSuggestion = {
  key: string;
  name: string;
  studio: string | null;
  items: { id: number; title: string; part: number }[];
};

export async function fetchSeriesSuggestions(): Promise<{ suggestions: SeriesSuggestion[] }> {
  const response = await fetch("/api/series/suggestions");
  if (!response.ok) throw new Error(`Failed to load suggestions: ${response.status}`);
  return response.json();
}

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
  /** When this profile last played it; null if never. */
  lastPlayedAt?: string | null;
  releaseDate?: string | null;
  description?: string | null;
  /** Who is in this episode; it can differ from one to the next. */
  performers?: { id: number; name: string }[];
};

export type SeriesDetail = {
  id: number;
  name: string;
  /** The first part's synopsis, standing for the series. */
  description?: string | null;
  /** An uploaded poster; null for none. */
  coverFile?: string | null;
  studios?: string[];
  firstReleased?: string | null;
  lastReleased?: string | null;
  /** Who is in it across its parts, most-appearing first. */
  performers?: { id: number; name: string; parts: number }[];
  seasons: { number: number; episodes: SeriesEpisode[] }[];
};

/** Another series related to one: by shared performers, then studio. */
export type RelatedSeries = {
  id: number;
  name: string;
  representativeItemId: number | null;
  episodeCount: number;
  sharedPerformers: number;
  sameStudio: boolean;
};

export async function fetchRelatedSeries(id: number): Promise<{ series: RelatedSeries[] }> {
  const response = await fetch(`/api/series/${id}/related`);
  if (!response.ok) throw new Error(`Failed to load related series: ${response.status}`);
  return response.json();
}

export function nextEpisodeInSeries(
  series: SeriesDetail,
  currentEpisodeId: number,
): SeriesEpisode | null {
  const episodes = series.seasons.flatMap((season) => season.episodes);
  const currentIndex = episodes.findIndex((episode) => episode.id === currentEpisodeId);
  return currentIndex < 0 ? null : episodes[currentIndex + 1] ?? null;
}

/** Every series, or — given a performer — only those they appear in. */
export async function fetchSeries(performerId?: number): Promise<{ series: SeriesSummary[] }> {
  const response = await fetch(performerId ? `/api/series?performer=${performerId}` : "/api/series");
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

/** The poster's URL; the file name changes on every upload, so it busts caches. */
export const seriesCoverUrl = (id: number, coverFile: string) =>
  `/api/series/${id}/cover?v=${encodeURIComponent(coverFile)}`;

export async function uploadSeriesCover(id: number, file: File): Promise<void> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/series/${id}/cover`, { method: "POST", body });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `Upload failed: ${res.status}`);
  }
}

export async function removeSeriesCover(id: number): Promise<void> {
  const res = await fetch(`/api/series/${id}/cover`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Couldn't remove the cover: ${res.status}`);
}
