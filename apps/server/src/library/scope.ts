import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { eq, inArray, sql } from "drizzle-orm";
import { anyInt } from "../db/anyOf.js";
import { db } from "../db/client.js";
import {
  albums,
  libraryRoots,
  mediaFiles,
  mediaItemPerformers,
  mediaItems,
  performers,
  series,
  studios,
} from "../db/schema.js";
import { POSTERS_DIR, PREVIEWS_DIR, SPRITES_DIR, THUMBNAILS_DIR } from "../media/cache.js";

/**
 * Whether a file path sits inside a configured folder.
 *
 * Done in JS rather than SQL on purpose: the SQL form needs a LIKE pattern
 * built from a user-chosen filesystem path, and `_` and `%` are both legal in
 * folder names and both LIKE wildcards. At personal-library size the row count
 * is trivial, and `markMissingFiles` already takes the same approach.
 */
export function isUnderRoot(filePath: string, rootPath: string): boolean {
  return filePath === rootPath || filePath.startsWith(rootPath + "/");
}

/**
 * Recomputes which files belong to which folder, and which items are visible.
 *
 * One definition, called from all three places that can change the answer:
 * adding a folder, removing one, and finishing a scan. Anything else risks the
 * two columns disagreeing.
 *
 * Set-based SQL rather than the JS loop it replaces. That loop collected every
 * id in the library and handed them to `inArray`, one bind parameter each —
 * past 65,535 files Postgres refuses the statement outright, so the end of
 * every scan on a large library failed. It also rewrote every row on every
 * call; the IS DISTINCT FROM conditions below touch only rows whose answer
 * actually changed.
 *
 * Prefix matching uses starts_with() rather than LIKE for the reason
 * isUnderRoot exists: `_` and `%` are legal in folder names and are LIKE
 * wildcards. When roots nest, the deepest one owns the file.
 *
 * Folder items are deliberately untouched — they have no file at all, so any
 * "has a file under a watched folder" rule would be false for every one of
 * them and blank the folder picker.
 */
export async function recomputeScope(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      update ${mediaFiles} f
      set root_id = owner.root_id
      from (
        select f2.id as file_id, (
          select r.id from ${libraryRoots} r
          where f2.path = r.path or starts_with(f2.path, r.path || '/')
          order by length(r.path) desc
          limit 1
        ) as root_id
        from ${mediaFiles} f2
      ) owner
      where f.id = owner.file_id
        and f.root_id is distinct from owner.root_id
    `);

    // Visible while any of the item's files sits under a watched folder.
    await tx.execute(sql`
      update ${mediaItems} mi
      set in_scope = s.in_scope
      from (
        select media_item_id, bool_or(root_id is not null) as in_scope
        from ${mediaFiles}
        group by media_item_id
      ) s
      where mi.id = s.media_item_id
        and mi.in_scope is distinct from s.in_scope
    `);

    // Folders hold no bytes and are never produced by a scan, so they stay
    // visible regardless of which folders are being watched.
    await tx
      .update(mediaItems)
      .set({ inScope: true })
      .where(
        sql`${mediaItems.inScope} = false and ${mediaItems.itemTypeId} in (select id from media_item_types where name = 'folder')`
      );
  });
}

/** Convenience for the delete-root handler, which knows the root already. */
export async function clearScopeForRoot(rootId: number): Promise<void> {
  const affected = db
    .select({ id: mediaFiles.mediaItemId })
    .from(mediaFiles)
    .where(eq(mediaFiles.rootId, rootId));
  await db.update(mediaItems).set({ inScope: false }).where(inArray(mediaItems.id, affected));
  await db.update(mediaFiles).set({ rootId: null }).where(eq(mediaFiles.rootId, rootId));
}

/**
 * Removes performers and studios that no longer have a single visible item.
 *
 * These are debris from folders that are no longer scanned — a directory
 * called "Downloads" becoming a performer, say. Items themselves are only
 * ever hidden, never deleted, so this cleans the lists without touching
 * anything you authored.
 */
export async function purgeEmptyEntities(): Promise<{
  performers: number;
  studios: number;
  albums: number;
  series: number;
}> {
  // "No items at all", not "no *visible* items". Two reasons, and the first
  // is a hard crash: an item that is merely hidden still has its join row, so
  // deleting the performer violates the foreign key and fails the whole scan.
  //
  // The second is that hiding is meant to be reversible. Removing a scan
  // folder hides its items so re-adding restores them instantly; destroying
  // their performers in the meantime would make that restore incomplete.
  //
  // Hand-authored content is spared regardless. api/performers.ts relies on
  // being able to create a performer by hand before their files arrive, so
  // the filename pass can match them on the next scan — and that performer
  // has no join rows at all, so without this the very next scan deleted them
  // along with any bio or artwork you had added.
  //
  // `origin` is the direct statement of that; the bio/artwork checks remain
  // for performers created by hand before the column existed, which were
  // backfilled as 'scanner'. Favouriting (by any profile) or archiving
  // someone is also a deliberate act about that performer, so either keeps them.
  const deadPerformers = await db
    .select({ id: performers.id })
    .from(performers)
    .where(
      sql`not exists (
        select 1 from ${mediaItemPerformers} mip
        where mip.performer_id = ${performers.id}
      )
      and ${performers.origin} = 'scanner'
      and not exists (
        select 1 from profile_performer_state pps
        where pps.performer_id = ${performers.id} and pps.is_favorite
      )
      and ${performers.archivedAt} is null
      and ${performers.bio} is null
      and ${performers.imageFile} is null
      and ${performers.bannerFile} is null`
    );

  // Same reasoning: media_items.studio_id still references a studio whose
  // items are only hidden, so scoping this to in_scope would fail the delete.
  const deadStudios = await db
    .select({ id: studios.id })
    .from(studios)
    .where(
      sql`not exists (
        select 1 from ${mediaItems} mi
        where mi.studio_id = ${studios.id}
      )`
    );

  // Albums point at a performer and a studio, and neither check above knows
  // that — they ask about media items only. An album naming a performer whose
  // items have gone kept a reference to a row about to be deleted, and
  // Postgres refused the delete: the whole cleanup failed with a foreign key
  // violation and nothing was removed at all.
  //
  // Cleared rather than cascaded: an album keeps existing and simply stops
  // claiming a performer the library no longer has.
  if (deadPerformers.length > 0) {
    const ids = deadPerformers.map((row) => row.id);
    await db
      .update(albums)
      .set({ performerId: null })
      .where(anyInt(albums.performerId, ids));
    await db.delete(performers).where(anyInt(performers.id, ids));
  }

  if (deadStudios.length > 0) {
    const ids = deadStudios.map((row) => row.id);
    await db
      .update(albums)
      .set({ studioId: null })
      .where(anyInt(albums.studioId, ids));
    await db.delete(studios).where(anyInt(studios.id, ids));
  }

  // Albums whose files are all gone. media_items.album_id still points at
  // them, so those references have to be cleared first — deleting the parent
  // while children reference it is the foreign-key error that has already
  // broken this function once, and the collection delete separately.
  const emptyAlbums = await db
    .select({ id: albums.id })
    .from(albums)
    .where(
      sql`not exists (
        select 1 from ${mediaItems} mi where mi.album_id = ${albums.id}
      )`
    );

  if (emptyAlbums.length > 0) {
    const ids = emptyAlbums.map((a) => a.id);
    await db.update(mediaItems).set({ albumId: null }).where(anyInt(mediaItems.albumId, ids));
    await db.delete(albums).where(anyInt(albums.id, ids));
  }

  // Series, on the same rule as albums: media_items.series_id references
  // them, so the references go before the rows. Added later than the rest of
  // this function, which is why an emptied series used to survive a cleanup
  // that took its videos.
  const emptySeries = await db
    .select({ id: series.id })
    .from(series)
    .where(
      sql`not exists (
        select 1 from ${mediaItems} mi where mi.series_id = ${series.id}
      )`
    );

  if (emptySeries.length > 0) {
    const ids = emptySeries.map((row) => row.id);
    await db.update(mediaItems).set({ seriesId: null }).where(anyInt(mediaItems.seriesId, ids));
    await db.delete(series).where(anyInt(series.id, ids));
  }

  return {
    performers: deadPerformers.length,
    studios: deadStudios.length,
    albums: emptyAlbums.length,
    series: emptySeries.length,
  };
}

/**
 * Cache filenames the app writes: `<itemId>-<hash|nohash>.<ext>`, with a
 * `w<width>-` prefix for photo thumbnails. Anything else in these directories
 * is a temp file from an in-flight (or crashed) write.
 */
const CACHE_NAME = /^(?:w\d+-)?(\d+)-([0-9a-f]+|nohash)\.[a-z0-9]+$/;

/** Temp files older than this belong to a write that died. */
const STALE_TEMP_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes cached artwork that nothing will ever look up again: files for
 * items that no longer exist, and files for an *old* version of a file that
 * was since replaced in place.
 *
 * The second case is the one that used to leak. Artwork is keyed by content
 * hash, so when a video is re-encoded its new poster and preview are written
 * under the new hash and the old pair sat there forever — a full preview clip
 * per re-encode.
 *
 * Covers every derived directory (posters, previews, photo thumbnails, scrub
 * sprites), not just the two the scanner itself writes.
 *
 * Safe by construction: everything here is regenerated from the source on the
 * next scan or request, so the worst case of over-deleting is wasted CPU,
 * never lost data.
 */
export async function sweepOrphanedArtwork(): Promise<number> {
  const rows = await db
    .select({ id: mediaItems.id, contentHash: mediaFiles.contentHash })
    .from(mediaItems)
    .leftJoin(mediaFiles, eq(mediaFiles.mediaItemId, mediaItems.id));
  // An item can have more than one file, and an item with no file at all (a
  // folder) has no hash; both are represented, so neither loses its artwork.
  const liveHashes = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = String(row.id);
    const set = liveHashes.get(key) ?? new Set<string>();
    set.add(row.contentHash ?? "nohash");
    liveHashes.set(key, set);
  }

  let removed = 0;
  const now = Date.now();
  for (const dir of [POSTERS_DIR, PREVIEWS_DIR, THUMBNAILS_DIR, SPRITES_DIR]) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue; // directory not created yet
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const match = CACHE_NAME.exec(entry);
      if (!match) {
        // A temp file. Left alone while it could still be being written —
        // deleting a preview mid-encode would fail that encode — and removed
        // once it is clearly the leftover of a write that never finished.
        try {
          if (now - (await stat(full)).mtimeMs < STALE_TEMP_MS) continue;
        } catch {
          continue;
        }
      } else {
        const hashes = liveHashes.get(match[1]);
        if (hashes?.has(match[2])) continue;
      }
      await rm(full, { force: true, recursive: true });
      removed += 1;
    }
  }
  return removed;
}
