// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from "@tanstack/react-query";
import { qk } from "./queryKeys";

/** A named stretch of a video — a position or act — from ThePornDB. */
export type Marker = {
  id: number;
  mediaItemId: number;
  title: string;
  startSeconds: number;
  endSeconds: number | null;
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * The key two spellings of one position share, so "Standing Doggy Style" and
 * "Standing Doggystyle" get the same colour.
 */
export function markerKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * A colour per position name, the same wherever it appears: the third
 * "Missionary" in a scene reads as the first one did.
 */
const HUES = [12, 36, 140, 172, 200, 228, 262, 292, 320, 345];
export function markerColor(title: string): string {
  let hash = 0;
  for (const char of markerKey(title)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${HUES[hash % HUES.length]} 75% 58%)`;
}

export type MarkerSegment = {
  marker: Marker;
  start: number;
  end: number;
  /** Which stacked row it is drawn in; overlapping stretches go below each other. */
  row: number;
};

/** Rows beyond this are folded into the last one rather than growing the bar. */
export const MAX_MARKER_ROWS = 3;

/**
 * Where each marker sits on a bar of `duration` seconds.
 *
 * A marker with no end runs to the next marker that starts after it (sources
 * often give only start times, one position following the next), or to the
 * end of the video. Stretches that overlap are put in separate rows, first
 * row that is free.
 */
export function layoutMarkers(markers: Marker[], duration: number): MarkerSegment[] {
  if (!(duration > 0)) return [];
  const sorted = [...markers]
    .filter((m) => m.startSeconds < duration)
    .sort((a, b) => a.startSeconds - b.startSeconds || a.id - b.id);
  const rowEnds: number[] = [];
  return sorted.map((marker, index) => {
    const next = sorted.slice(index + 1).find((m) => m.startSeconds > marker.startSeconds);
    const end = Math.min(duration, marker.endSeconds ?? next?.startSeconds ?? duration);
    let row = rowEnds.findIndex((rowEnd) => rowEnd <= marker.startSeconds);
    if (row === -1) row = Math.min(rowEnds.length, MAX_MARKER_ROWS - 1);
    rowEnds[row] = Math.max(rowEnds[row] ?? 0, end);
    return { marker, start: marker.startSeconds, end, row };
  });
}

/** The marker playing at a moment: the latest-starting one that covers it. */
export function markerAt(segments: MarkerSegment[], seconds: number): Marker | undefined {
  let found: MarkerSegment | undefined;
  for (const segment of segments) {
    if (segment.start <= seconds && seconds < segment.end) {
      if (!found || segment.start >= found.start) found = segment;
    }
  }
  return found?.marker;
}

/**
 * Seconds into the current position, past which "previous" goes back to its
 * start rather than to the one before — as chapter keys do in most players.
 */
const RESTART_WITHIN = 3;

/**
 * Where `]` (next) or `[` (previous) should go from `current`: the start of
 * the next position, or the start of the one playing — or the one before it
 * when you are only just into it. Undefined when there is nowhere to go.
 */
export function adjacentPositionStart(
  markers: Marker[],
  current: number,
  direction: 1 | -1,
): number | undefined {
  const starts = [...new Set(markers.map((m) => m.startSeconds))].sort((a, b) => a - b);
  if (direction === 1) return starts.find((start) => start > current + 0.5);
  return starts.filter((start) => start <= current - RESTART_WITHIN).at(-1);
}

export function useMarkers(itemId: number, enabled = true) {
  return useQuery({
    queryKey: qk.markers(itemId),
    queryFn: async () =>
      (await json<{ markers: Marker[] }>(await fetch(`/api/media-items/${itemId}/markers`))).markers,
    enabled,
    // Looked up on ThePornDB the first time a video is opened, then stored;
    // nothing new turns up while it plays.
    staleTime: Infinity,
  });
}
