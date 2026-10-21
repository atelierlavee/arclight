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
  patch: { isFavorite?: boolean; rating?: number | null; hiddenAt?: Date | null },
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
