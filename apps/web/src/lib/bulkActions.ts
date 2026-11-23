// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import type { BulkResult } from "./bulkSummary";

/**
 * The per-item loop every bulk action shares.
 *
 * Each action is one request per item rather than a bulk endpoint, because
 * the server has no bulk endpoint and §30 asks to reuse what exists before
 * adding routes. The loop stays sequential for the reason the tag action
 * already documented: this points at a self-hosted box, and forty parallel
 * read-then-write pairs is a worse neighbour than forty in a row.
 *
 * `step` reports what happened to one item so the caller doesn't repeat the
 * try/catch/finally bookkeeping five times. Returning "skipped" is for work
 * that was already done — tagging something that carries the tag — which is
 * not a failure and should not be counted as one.
 */
export type StepOutcome = "ok" | "skipped";

export async function runPerItem(
  itemIds: number[],
  step: (id: number) => Promise<StepOutcome>,
  onProgress: (done: number) => void,
): Promise<BulkResult> {
  const result: BulkResult = { ok: 0, failed: 0, skipped: 0 };

  for (const [index, id] of itemIds.entries()) {
    try {
      const outcome = await step(id);
      if (outcome === "skipped") result.skipped += 1;
      else result.ok += 1;
    } catch {
      // A dropped connection mid-run is a failure for this item only.
      result.failed += 1;
    } finally {
      onProgress(index + 1);
    }
  }

  return result;
}

async function readItem(id: number): Promise<{
  tags: { name: string }[];
  performers: { name: string }[];
  isFavorite: boolean;
  watched: boolean;
  rating: number | null;
  studio: string | null;
}> {
  const res = await fetch(`/api/media-items/${id}`);
  if (!res.ok) throw new Error(`Failed to read item ${id}`);
  return res.json();
}

async function putJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
}

/**
 * Adds or removes one tag across a selection.
 *
 * PUT /tags replaces an item's full tag set, so a single tag change means
 * merging with that item's existing tags first rather than overwriting them.
 * That read is also what makes "already tagged" distinguishable from "tagged
 * just now", which is the difference between a skip and an ok.
 */
export function setTagOnItems(
  itemIds: number[],
  tagName: string,
  present: boolean,
  onProgress: (done: number) => void,
): Promise<BulkResult> {
  return runPerItem(
    itemIds,
    async (id) => {
      const item = await readItem(id);
      const names = item.tags.map((tag) => tag.name);
      const has = names.includes(tagName);
      if (has === present) return "skipped";

      const next = present
        ? [...names, tagName]
        : names.filter((name) => name !== tagName);
      await putJson(`/api/media-items/${id}/tags`, { tagNames: next });
      return "ok";
    },
    onProgress,
  );
}

export function setFavoriteOnItems(
  itemIds: number[],
  isFavorite: boolean,
  onProgress: (done: number) => void,
): Promise<BulkResult> {
  return runPerItem(
    itemIds,
    async (id) => {
      // Read first so an item already in the wanted state is reported as a
      // skip. Without it, "Favourited 40" would be the message for a
      // selection that was entirely favourites to begin with.
      const item = await readItem(id);
      if (item.isFavorite === isFavorite) return "skipped";

      const res = await fetch(`/api/media-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return "ok";
    },
    onProgress,
  );
}

export function setWatchedOnItems(
  itemIds: number[],
  watched: boolean,
  onProgress: (done: number) => void,
): Promise<BulkResult> {
  return runPerItem(
    itemIds,
    async (id) => {
      // The same read-first reasoning as favourites, with a sharper edge:
      // PUT /watched increments a play count, so re-marking forty already
      // watched items would inflate every one of their counts.
      const item = await readItem(id);
      if (item.watched === watched) return "skipped";

      await putJson(`/api/media-items/${id}/watched`, { watched });
      return "ok";
    },
    onProgress,
  );
}

export function addItemsToCollection(
  itemIds: number[],
  collectionId: number,
  onProgress: (done: number) => void,
): Promise<BulkResult> {
  return runPerItem(
    itemIds,
    async (id) => {
      const res = await fetch(`/api/collections/${collectionId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaItemId: id }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return "ok";
    },
    onProgress,
  );
}

export function removeItemsFromCollection(
  itemIds: number[],
  collectionId: number,
  onProgress: (done: number) => void,
): Promise<BulkResult> {
  return runPerItem(
    itemIds,
    async (id) => {
      const res = await fetch(`/api/collections/${collectionId}/items/${id}`, {
        method: "DELETE",
      });
      // No read-first check here, unlike favourites and watched. The delete
      // matches on (collection, item) and reports success either way, so an
      // item that was never in the collection costs one request rather than
      // two and ends in the state the user asked for regardless.
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return "ok";
    },
    onProgress,
  );
}

async function patchItem(id: number, body: unknown): Promise<void> {
  const res = await fetch(`/api/media-items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
}

/** Sets (or, with null, clears) the stars on every selected item. */
export function setRatingOnItems(
  itemIds: number[],
  rating: number | null,
  onProgress: (done: number) => void,
): Promise<BulkResult> {
  return runPerItem(
    itemIds,
    async (id) => {
      const item = await readItem(id);
      if (item.rating === rating) return "skipped";
      await patchItem(id, { rating });
      return "ok";
    },
    onProgress,
  );
}

/**
 * Sets one studio across a selection, or clears it with null.
 *
 * Like editing it in the sheet, this marks the studio as yours, so a rescan
 * will not put back whatever the filename brackets said.
 */
export function setStudioOnItems(
  itemIds: number[],
  studio: string | null,
  onProgress: (done: number) => void,
): Promise<BulkResult> {
  return runPerItem(
    itemIds,
    async (id) => {
      const item = await readItem(id);
      if ((item.studio ?? null) === studio) return "skipped";
      await patchItem(id, { studio });
      return "ok";
    },
    onProgress,
  );
}

/**
 * Adds or removes one performer across a selection.
 *
 * PUT /performers replaces an item's whole cast, so this merges with what
 * each item already has — the same read-then-write as tags, for the same
 * reason. Names compare case-insensitively, since the server matches
 * performers that way and "jane doe" would otherwise be added beside "Jane
 * Doe" as if she were missing.
 */
export function setPerformerOnItems(
  itemIds: number[],
  performerName: string,
  present: boolean,
  onProgress: (done: number) => void,
): Promise<BulkResult> {
  const wanted = performerName.toLowerCase();
  return runPerItem(
    itemIds,
    async (id) => {
      const item = await readItem(id);
      const names = item.performers.map((performer) => performer.name);
      const has = names.some((name) => name.toLowerCase() === wanted);
      if (has === present) return "skipped";

      const next = present
        ? [...names, performerName]
        : names.filter((name) => name.toLowerCase() !== wanted);
      await putJson(`/api/media-items/${id}/performers`, { performerNames: next });
      return "ok";
    },
    onProgress,
  );
}
