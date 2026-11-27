// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

/** Which posters the screensaver draws from. */
export type ScreensaverSource = "all" | "favourites" | "unwatched" | "topRated";

export const SCREENSAVER_SOURCES: { value: ScreensaverSource; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "favourites", label: "Favourites" },
  { value: "unwatched", label: "Unwatched" },
  { value: "topRated", label: "Top rated" },
];
