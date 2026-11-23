// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { pkey } from "./profileStorage";

/** How long each photo can hold during a slideshow, in seconds; the button steps through them. */
export const SLIDESHOW_SPEEDS = [3, 5, 8, 15] as const;
export const DEFAULT_SLIDESHOW_SECONDS = 5;
export const SLIDESHOW_SPEED_KEY = "slideshow-seconds";

/** The remembered speed, per profile; the default when unset or unreadable. */
export function readSlideshowSeconds(): number {
  try {
    const stored = Number(localStorage.getItem(pkey(SLIDESHOW_SPEED_KEY)));
    return (SLIDESHOW_SPEEDS as readonly number[]).includes(stored)
      ? stored
      : DEFAULT_SLIDESHOW_SECONDS;
  } catch {
    return DEFAULT_SLIDESHOW_SECONDS;
  }
}

/** The speed after `current`, wrapping round. */
export function nextSlideshowSpeed(current: number): number {
  const at = (SLIDESHOW_SPEEDS as readonly number[]).indexOf(current);
  return SLIDESHOW_SPEEDS[(at + 1) % SLIDESHOW_SPEEDS.length];
}
