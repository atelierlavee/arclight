// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "./queryKeys";

export type Bookmark = {
  id: number;
  mediaItemId: number;
  positionSeconds: number;
  label: string | null;
  note: string | null;
  createdAt: string;
};

/** Layout of a video's seek-bar preview sheet. See scrubSprite.ts on the server. */
export type ScrubSprite = {
  url: string;
  /** Seconds each frame stands for: frame i covers [i × interval, (i + 1) × interval). */
  interval: number;
  count: number;
  columns: number;
  tileWidth: number;
  tileHeight: number;
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/** "1:02:05" or "4:07" — the clock format a seek bar reads in, not "4m". */
export function formatTimestamp(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Which cell of the sheet shows a moment, as a background offset in pixels. */
export function spriteFrameAt(sprite: ScrubSprite, seconds: number): { x: number; y: number } {
  const index = Math.min(sprite.count - 1, Math.max(0, Math.floor(seconds / sprite.interval)));
  return {
    x: (index % sprite.columns) * sprite.tileWidth,
    y: Math.floor(index / sprite.columns) * sprite.tileHeight,
  };
}

/** The video's file could not be reached (its drive is not connected), as opposed to unreadable. */
export class VideoOfflineError extends Error {
  constructor() {
    super("The video file is not reachable");
    this.name = "VideoOfflineError";
  }
}

export function useScrubSprite(itemId: number, enabled: boolean) {
  return useQuery({
    queryKey: qk.scrubSprite(itemId),
    queryFn: async () => {
      const res = await fetch(`/api/media-items/${itemId}/scrub`);
      if (res.status === 404) {
        const body = (await res.json().catch(() => null)) as { offline?: boolean } | null;
        if (body?.offline) throw new VideoOfflineError();
      }
      return json<ScrubSprite>(res);
    },
    enabled,
    // Built once per file and never changes, so there is nothing to refetch.
    // No retry: a 404 means ffmpeg could read no frames, and asking again
    // three times would only repeat a hundred failing seeks.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}

export function useBookmarks(itemId: number, enabled = true) {
  return useQuery({
    queryKey: qk.bookmarks(itemId),
    queryFn: async () =>
      (await json<{ bookmarks: Bookmark[] }>(await fetch(`/api/media-items/${itemId}/bookmarks`)))
        .bookmarks,
    enabled,
  });
}

export function useBookmarkMutations(itemId: number) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.bookmarks(itemId) });

  const add = useMutation({
    mutationFn: async ({ positionSeconds, label, note }: {
      positionSeconds: number;
      label?: string;
      note?: string;
    }) =>
      json<Bookmark>(
        await fetch(`/api/media-items/${itemId}/bookmarks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positionSeconds, label, note }),
        }),
      ),
    onSuccess: refresh,
  });

  const rename = useMutation({
    mutationFn: async ({ id, label }: { id: number; label: string }) =>
      json<Bookmark>(
        await fetch(`/api/bookmarks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label }),
        }),
      ),
    onSuccess: refresh,
  });

  const saveNote = useMutation({
    mutationFn: async ({ id, note }: { id: number; note: string }) =>
      json<Bookmark>(
        await fetch(`/api/bookmarks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note }),
        }),
      ),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (id: number) =>
      json<{ ok: true }>(await fetch(`/api/bookmarks/${id}`, { method: "DELETE" })),
    onSuccess: refresh,
  });

  return { add, rename, saveNote, remove };
}
