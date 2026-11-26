// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";

/**
 * A full-quality still at a whole second of a video, fading in over whatever
 * placeholder sits beneath it (a cell of the small seek-bar sheet) once it
 * has loaded; gone if it can't be read, leaving the placeholder.
 *
 * The server extracts each frame once and caches it, so a page of these
 * fills in over a moment the first time and at once after that.
 */
export function SharpFrame({ itemId, seconds }: { itemId: number; seconds: number }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={`/api/media-items/${itemId}/frame.jpg?t=${Math.max(0, Math.round(seconds))}`}
      alt=""
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      className={`sensitive absolute inset-0 size-full object-cover transition-opacity duration-300 ${
        loaded ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
