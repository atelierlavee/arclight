// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A duration as "1h 24m", or "24m" under the hour.
 *
 * Shared rather than per-surface: the peek panel, the detail modal and the
 * queue all state the same number, and three roundings of the same seconds
 * is how the grid and the modal end up disagreeing by a minute.
 */
export function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}
