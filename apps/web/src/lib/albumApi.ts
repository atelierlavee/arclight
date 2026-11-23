// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

export type AlbumSummary = {
  id: number;
  title: string;
  performer: string | null;
  studio: string | null;
  photoCount: number;
  coverItemId: number | null;
  videoItemId: number | null;
  /** The first few photos, for the stack on the albums page. */
  previewItemIds?: number[];
  /** Cover framing. Defaults are 50 / 50 / 100 — centred and unzoomed. */
  coverPositionX: number;
  coverPositionY: number;
  coverScale: number;
};

export type AlbumPhoto = { id: number; title: string; thumbnailFile: string | null };

export type AlbumDetail = {
  id: number;
  title: string;
  performer: string | null;
  studio: string | null;
  /** The hand-picked cover. Null means it's still whichever photo comes first. */
  coverItemId: number | null;
  coverPositionX: number;
  coverPositionY: number;
  coverScale: number;
  video: { id: number; title: string } | null;
  photos: AlbumPhoto[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export async function fetchAlbums(
  filter: { performer?: string; studio?: string } = {}
): Promise<{ albums: AlbumSummary[] }> {
  const params = new URLSearchParams();
  if (filter.performer) params.set("performer", filter.performer);
  if (filter.studio) params.set("studio", filter.studio);
  const query = params.toString();
  const res = await fetch(`/api/albums${query ? `?${query}` : ""}`);
  if (!res.ok) throw new Error(`Failed to load albums: ${res.status}`);
  return res.json();
}

/**
 * Sets the cover photo, its framing, or both.
 *
 * `coverItemId: null` goes back to using the album's first photo. Changing
 * the photo resets the framing server-side, unless framing is sent with it.
 */
export async function saveAlbumCover(
  id: number,
  patch: {
    coverItemId?: number | null;
    coverPositionX?: number;
    coverPositionY?: number;
    coverScale?: number;
  }
): Promise<void> {
  const res = await fetch(`/api/albums/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to save the cover: ${res.status}`);
}

/**
 * Inline style applying an album's cover framing.
 *
 * Mirrors framingStyle for media thumbnails: undefined when untouched, so
 * React doesn't attach a style attribute to every card that doesn't need one.
 */
export function coverFramingStyle(album: {
  coverPositionX?: number;
  coverPositionY?: number;
  coverScale?: number;
}): React.CSSProperties | undefined {
  const x = album.coverPositionX ?? 50;
  const y = album.coverPositionY ?? 50;
  const scale = album.coverScale ?? 100;
  if (x === 50 && y === 50 && scale === 100) return undefined;

  return {
    objectPosition: `${x}% ${y}%`,
    transform: `scale(${scale / 100})`,
    // Same anchor as the position, so zooming reveals the side the crop is
    // already showing instead of pulling away from it.
    transformOrigin: `${x}% ${y}%`,
  };
}

export async function fetchAlbum(id: number, page = 1): Promise<AlbumDetail> {
  const res = await fetch(`/api/albums/${id}?page=${page}`);
  if (!res.ok) throw new Error(`Failed to load album: ${res.status}`);
  return res.json();
}
