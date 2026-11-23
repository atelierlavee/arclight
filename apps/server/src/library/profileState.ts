// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { and, eq, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { db } from "../db/client.js";
import { profileItemState, profilePerformerState } from "../db/schema.js";

/**
 * Per-profile favourite / rating / hidden, as SQL fragments.
 *
 * These used to be columns on media_items and performers, so every query
 * just selected them. They now live in profile_item_state and
 * profile_performer_state, one row per (profile, thing) that profile has
 * touched. Correlated lookups rather than LEFT JOINs because they drop into
 * the dozens of existing selects, wheres and order-bys without restructuring
 * any of them; each is a primary-key probe, so the cost per row is one index
 * lookup.
 *
 * `item` is the column (or raw SQL, for hand-written queries against an
 * alias) holding the media item id the state is about.
 */
type ItemRef = SQLWrapper;

export function itemIsFavorite(profileId: number, item: ItemRef): SQL<boolean> {
  return sql<boolean>`coalesce((select pis.is_favorite from profile_item_state pis where pis.profile_id = ${profileId} and pis.media_item_id = ${item}), false)`.mapWith(
    Boolean,
  );
}

/** 1–5, or null for "not rated" — the same contract the column had. */
export function itemRating(profileId: number, item: ItemRef): SQL<number | null> {
  return sql<number | null>`(select pis.rating from profile_item_state pis where pis.profile_id = ${profileId} and pis.media_item_id = ${item})`.mapWith(
    (value: unknown) => (value === null || value === undefined ? null : Number(value)),
  );
}

/** How many times this profile has counted the item; 0 when it never has. */
export function itemOCount(profileId: number, item: ItemRef): SQL<number> {
  return sql<number>`coalesce((select pis.o_count from profile_item_state pis where pis.profile_id = ${profileId} and pis.media_item_id = ${item}), 0)`.mapWith(
    Number,
  );
}

/** When this profile put the item on Watch Later, or null when it is not on it. */
export function itemWatchLaterAt(profileId: number, item: ItemRef): SQL<Date | null> {
  return sql<Date | null>`(select pis.watch_later_at from profile_item_state pis where pis.profile_id = ${profileId} and pis.media_item_id = ${item})`.mapWith(
    profileItemState.watchLaterAt,
  );
}

/** As a filter: on this profile's Watch Later list. */
export function itemWatchLaterFilter(profileId: number, item: ItemRef): SQL {
  return sql`exists (select 1 from profile_item_state pis where pis.profile_id = ${profileId} and pis.media_item_id = ${item} and pis.watch_later_at is not null)`;
}

export function itemHiddenAt(profileId: number, item: ItemRef): SQL<Date | null> {
  return sql<Date | null>`(select pis.hidden_at from profile_item_state pis where pis.profile_id = ${profileId} and pis.media_item_id = ${item})`.mapWith(
    profileItemState.hiddenAt,
  );
}

/** True when the item is in this profile's vault. */
export function itemIsHidden(profileId: number, item: ItemRef): SQL {
  return sql`exists (select 1 from profile_item_state pis where pis.profile_id = ${profileId} and pis.media_item_id = ${item} and pis.hidden_at is not null)`;
}

/** The complement, for "everything this profile has not hidden". */
export function itemNotHidden(profileId: number, item: ItemRef): SQL {
  return sql`not ${itemIsHidden(profileId, item)}`;
}

/** As a filter — cheaper to read than `itemIsFavorite(...) = true`. */
export function itemFavoriteFilter(profileId: number, item: ItemRef): SQL {
  return sql`exists (select 1 from profile_item_state pis where pis.profile_id = ${profileId} and pis.media_item_id = ${item} and pis.is_favorite)`;
}

export function performerIsFavorite(profileId: number, performer: ItemRef): SQL<boolean> {
  return sql<boolean>`coalesce((select pps.is_favorite from profile_performer_state pps where pps.profile_id = ${profileId} and pps.performer_id = ${performer}), false)`.mapWith(
    Boolean,
  );
}

export function performerFavoriteFilter(profileId: number, performer: ItemRef): SQL {
  return sql`exists (select 1 from profile_performer_state pps where pps.profile_id = ${profileId} and pps.performer_id = ${performer} and pps.is_favorite)`;
}

/**
 * Writes part of one profile's state for one item, creating the row if it
 * is the first thing this profile has done with it. Only the fields given
 * change; an upsert so two quick clicks cannot race into a duplicate key.
 */
export async function setItemState(
  profileId: number,
  mediaItemId: number,
  patch: {
    isFavorite?: boolean;
    rating?: number | null;
    hiddenAt?: Date | null;
    watchLaterAt?: Date | null;
    note?: string | null;
  },
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await db
    .insert(profileItemState)
    .values({ profileId, mediaItemId, ...patch })
    .onConflictDoUpdate({
      target: [profileItemState.profileId, profileItemState.mediaItemId],
      set: patch,
    });
}

export async function setPerformerFavorite(
  profileId: number,
  performerId: number,
  isFavorite: boolean,
): Promise<void> {
  await db
    .insert(profilePerformerState)
    .values({ profileId, performerId, isFavorite })
    .onConflictDoUpdate({
      target: [profilePerformerState.profileId, profilePerformerState.performerId],
      set: { isFavorite },
    });
}

/** The longest note kept, in characters. Generous: it is a notepad, not a tweet. */
export const NOTE_MAX_LENGTH = 10_000;

/**
 * Reads a note from a request body: a string (trimmed, empty becomes null)
 * or null. Anything else, or a note past the limit, is an error message.
 */
export function parseNote(value: unknown): { ok: true; note: string | null } | { ok: false; error: string } {
  if (value === null) return { ok: true, note: null };
  if (typeof value !== "string") return { ok: false, error: "note must be a string or null" };
  const trimmed = value.trim();
  if (trimmed.length > NOTE_MAX_LENGTH) {
    return { ok: false, error: `note must be at most ${NOTE_MAX_LENGTH} characters` };
  }
  return { ok: true, note: trimmed || null };
}

/** This profile's note on an item, or null. */
export function itemNote(profileId: number, item: ItemRef): SQL<string | null> {
  return sql<string | null>`(select pis.note from profile_item_state pis where pis.profile_id = ${profileId} and pis.media_item_id = ${item})`;
}

/** As a search condition: this profile's note on the item contains the pattern. */
export function itemNoteMatches(profileId: number, item: ItemRef, pattern: string): SQL {
  return sql`exists (select 1 from profile_item_state pis where pis.profile_id = ${profileId} and pis.media_item_id = ${item} and pis.note ilike ${pattern})`;
}

export async function setPerformerNote(
  profileId: number,
  performerId: number,
  note: string | null,
): Promise<void> {
  await db
    .insert(profilePerformerState)
    .values({ profileId, performerId, note })
    .onConflictDoUpdate({
      target: [profilePerformerState.profileId, profilePerformerState.performerId],
      set: { note },
    });
}

/** One item's state for one profile, defaults when it has never been touched. */
export async function readItemState(
  profileId: number,
  mediaItemId: number,
): Promise<{ isFavorite: boolean; rating: number | null; hiddenAt: Date | null }> {
  const [row] = await db
    .select()
    .from(profileItemState)
    .where(and(eq(profileItemState.profileId, profileId), eq(profileItemState.mediaItemId, mediaItemId)));
  return {
    isFavorite: row?.isFavorite ?? false,
    rating: row?.rating ?? null,
    hiddenAt: row?.hiddenAt ?? null,
  };
}
