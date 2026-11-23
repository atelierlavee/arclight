// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { useSyncExternalStore } from "react";

/**
 * Lean-back mode: a shuffled run through a set of videos that plays itself.
 *
 * The videos are the play queue, filled by whoever starts the session. What
 * the session adds on top is: cinema mode, always moving on to the next video
 * whatever the autoplay setting says, and — when `clipSeconds` is set — only
 * a stretch of each video, starting from its most replayed part.
 *
 * Kept in memory only: it ends when the player closes, and a reload is a
 * reasonable way to stop it too.
 */
export type LeanBackSession = {
  /** Seconds of each video to play, or null for whole videos. */
  clipSeconds: number | null;
};

export const LEAN_BACK_LENGTHS = [
  { clipSeconds: null, label: "Whole videos" },
  { clipSeconds: 5 * 60, label: "5-minute clips" },
  { clipSeconds: 2 * 60, label: "2-minute clips" },
] as const;

let session: LeanBackSession | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function startLeanBack(next: LeanBackSession): void {
  session = next;
  emit();
}

export function endLeanBack(): void {
  if (session === null) return;
  session = null;
  emit();
}

export function useLeanBackSession(): LeanBackSession | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => session,
    () => null,
  );
}

/**
 * Where a clip starts: the most replayed part when there is one, otherwise a
 * point a fifth to a half of the way in — past the intro, before the end —
 * chosen from the item id so the same video always starts at the same place.
 * Never so late that the clip would run off the end.
 */
export function clipStart(
  itemId: number,
  duration: number | null,
  clipSeconds: number,
  bestPart: number | null,
): number {
  if (!duration || duration <= clipSeconds) return 0;
  const latest = duration - clipSeconds;
  if (bestPart !== null) return Math.max(0, Math.min(latest, bestPart));
  const fraction = 0.2 + ((itemId * 2654435761) % 1000) / 1000 * 0.3;
  return Math.max(0, Math.min(latest, Math.floor(duration * fraction)));
}
