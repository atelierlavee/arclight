// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import path from "node:path";

export type ParsedSeries = {
  name: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string | null;
};

const EPISODE_PATTERN = /\bS(\d{1,2})E(\d{1,3})\b/i;

/** Parses local S01E02 naming without consulting external metadata. */
export function parseSeriesEpisode(filePath: string): ParsedSeries | null {
  const fileName = path.basename(filePath, path.extname(filePath));
  const match = fileName.match(EPISODE_PATTERN);
  if (!match) return null;

  const seasonNumber = Number(match[1]);
  const episodeNumber = Number(match[2]);
  const containingFolder = path.basename(path.dirname(filePath));
  const seasonFolder = /^(season\s*\d+|s\d+)$/i.test(containingFolder);
  const seriesFolder = seasonFolder ? path.dirname(path.dirname(filePath)) : path.dirname(filePath);
  const name = path.basename(seriesFolder).trim();
  if (!name) return null;

  const episodeTitle = fileName
    .replace(EPISODE_PATTERN, "")
    .replace(/^[\s._-]+|[\s._-]+$/g, "")
    .trim() || null;

  return { name, seasonNumber, episodeNumber, episodeTitle };
}
