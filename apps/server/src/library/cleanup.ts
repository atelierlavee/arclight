// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { count, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { mediaItems, mediaItemTypes } from "../db/schema.js";
import { deleteItems } from "./forget.js";
import { purgeEmptyEntities } from "./scope.js";

/**
 * What a removed folder leaves behind.
 *
 * Removing a scan folder hides its items rather than deleting them, so that
 * adding the folder back restores everything — titles, favourites, artwork.
 * The cost is that the names come with them: a performer or studio is only
 * purged when it has no items *at all*, and a hidden item still has its join
 * rows. So the lists keep showing a library you no longer have.
 *
 * This is the way out for when the folder is gone for good.
 */
export type CleanupSummary = {
  items: number;
  videos: number;
  photos: number;
  performers: number;
  studios: number;
  albums: number;
  series: number;
};

/** Items belonging to no watched folder. */
function unwatched() {
  return eq(mediaItems.inScope, false);
}

/**
 * Counts what a cleanup would remove, without removing anything.
 *
 * Entity counts are "attached only to items that are going" — a performer who
 * also appears in a folder you still watch is not debris and is not counted,
 * because the purge afterwards will not touch them either.
 */
export async function countRemovableData(): Promise<CleanupSummary> {
  const [items] = await db
    .select({ total: count() })
    .from(mediaItems)
    .where(unwatched());

  const byType = await db
    .select({ type: mediaItemTypes.name, total: count() })
    .from(mediaItems)
    .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
    .where(unwatched())
    .groupBy(mediaItemTypes.name);
  const counts = Object.fromEntries(byType.map((row) => [row.type, row.total]));

  // One query per entity, each asking the same question: is every item
  // pointing at this one on its way out?
  const orphaned = async (sqlText: ReturnType<typeof sql>) => {
    const rows = await db.execute<{ total: number }>(sqlText);
    return rows.rows[0]?.total ?? 0;
  };

  // "Nothing visible points at this", not "something hidden does".
  //
  // The stricter form missed anything already orphaned — a performer whose
  // items are simply gone has no hidden item to find, so the count came back
  // zero while the row sat there. That is exactly the state a half-finished
  // cleanup leaves behind, and it made the panel hide itself with work still
  // to do. This form covers both: attached only to items on their way out,
  // and attached to nothing at all.
  const performers = await orphaned(sql`
    select count(*)::int as total from performers p
    where not exists (
      select 1 from media_item_performers mip
      join media_items mi on mi.id = mip.media_item_id
      where mip.performer_id = p.id and mi.in_scope = true)
    -- Anything you wrote yourself survives, matching purgeEmptyEntities.
    and p.bio is null and p.image_file is null and p.banner_file is null`);

  const studios = await orphaned(sql`
    select count(*)::int as total from studios s
    where not exists (select 1 from media_items mi where mi.studio_id = s.id and mi.in_scope = true)`);

  const albums = await orphaned(sql`
    select count(*)::int as total from albums a
    where not exists (select 1 from media_items mi where mi.album_id = a.id and mi.in_scope = true)`);

  const seriesCount = await orphaned(sql`
    select count(*)::int as total from series se
    where not exists (select 1 from media_items mi where mi.series_id = se.id and mi.in_scope = true)`);

  return {
    items: items?.total ?? 0,
    videos: counts.video ?? 0,
    photos: counts.photo ?? 0,
    performers,
    studios,
    albums,
    series: seriesCount,
  };
}

/**
 * Permanently removes everything `countRemovableData` reported.
 *
 * Items first, then the entities left with nothing pointing at them. That
 * order matters: the entity purge asks "does any item reference this", and
 * while the items still exist the answer is yes for every one of them.
 */
export async function purgeRemovableData(): Promise<CleanupSummary> {
  const ids = await db
    .select({ id: mediaItems.id })
    .from(mediaItems)
    .where(unwatched());

  const before = await countRemovableData();
  const removed = await deleteItems(ids.map((row) => row.id));
  const purged = await purgeEmptyEntities();

  return {
    ...before,
    items: removed,
    performers: purged.performers,
    studios: purged.studios,
    albums: purged.albums,
    series: purged.series,
  };
}
