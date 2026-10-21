import { and, count, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import {
  collections,
  mediaFiles,
  mediaItems,
  mediaItemTypes,
  scanJobs,
  tags,
} from "../db/schema.js";
import { listBackups } from "../backup/create.js";
import { notHidden, visibleItems, visibleItemsSql } from "../library/visibility.js";

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/stats", async () => {
    const byType = await db
      .select({ type: mediaItemTypes.name, total: count() })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      // Vault items are left out of every figure on this page: a library
      // total that drops by one when you hide something says you did.
      .where(and(eq(mediaItems.inScope, true), notHidden()))
      .groupBy(mediaItemTypes.name);

    // How much disk the library actually occupies. Summed over files rather
    // than items: an item is a row, and only a file has a size.
    //
    // Returned as a string and converted here on purpose — sum() over bigint
    // is numeric, which the pg driver hands back as a string to avoid silently
    // losing precision. Number() is safe at this magnitude (exact to 9PB) but
    // the cast should be visible rather than implied.
    const [totalSize] = await db
      .select({
        bytes: sql<string>`coalesce(sum(${mediaFiles.sizeBytes}), 0)::bigint`,
      })
      .from(mediaFiles)
      .innerJoin(mediaItems, eq(mediaItems.id, mediaFiles.mediaItemId))
      // Matches what the counts above report: a folder you stopped scanning
      // shouldn't still be adding terabytes to the total.
      .where(visibleItems());

    const [{ total: tagCount }] = await db
      .select({ total: count() })
      .from(tags);
    const [{ total: collectionCount }] = await db
      .select({ total: count() })
      .from(collections);
    // Library health reports on videos alone.
    //
    // These counted every item, which made the headline number a statement
    // about photos: an album of 1,500 stills next to 52 videos meant a single
    // missing photo set moved "health" further than every video in the
    // library going missing would. Albums come and go with the videos they
    // were scanned beside, and nothing here is actionable for them.
    //
    // `videos`, `photos` and `totalBytes` above are untouched — the footer
    // still reports the whole library, which is what a summary should do.
    const isVideo = eq(mediaItemTypes.name, "video");

    const [{ total: videoTotal }] = await db
      .select({ total: count() })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .where(and(eq(mediaItems.inScope, true), notHidden(), isVideo));

    const [{ total: videoMissing }] = await db
      .select({ total: count() })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .where(
        and(
          eq(mediaItems.inScope, true),
          notHidden(),
          isVideo,
          sql`${mediaItems.missingSince} is not null`,
        ),
      );

    const [videoSize] = await db
      .select({
        bytes: sql<string>`coalesce(sum(${mediaFiles.sizeBytes}), 0)::bigint`,
      })
      .from(mediaFiles)
      .innerJoin(mediaItems, eq(mediaItems.id, mediaFiles.mediaItemId))
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .where(
        and(visibleItems(), isVideo),
      );

    // Also narrowed to in-scope videos, where the count above was over every
    // file in the database. Duplicate stills inside an album are how albums
    // work, not a problem to surface, and a folder you stopped scanning
    // should not still be reporting faults. Same visibility rule as the
    // duplicates list (GET /api/library/duplicates), so the count on the
    // dashboard and the groups behind it cannot disagree — and neither
    // counts a vault item.
    const duplicateRows = await db.execute<{ total: number }>(sql`
      select count(*)::int as total
      from (
        select mf.content_hash
        from media_files mf
        join media_items mi on mi.id = mf.media_item_id
        join media_item_types mit on mit.id = mi.item_type_id
        where mf.content_hash is not null
          and ${visibleItemsSql("mi")}
          and mit.name = 'video'
        group by mf.content_hash
        having count(*) > 1
      ) duplicate_groups
    `);
    const [lastScan] = await db
      .select({
        status: scanJobs.status,
        finishedAt: scanJobs.finishedAt,
        startedAt: scanJobs.startedAt,
      })
      .from(scanJobs)
      .orderBy(desc(scanJobs.id))
      .limit(1);
    const [lastBackup] = await listBackups();

    const counts = Object.fromEntries(byType.map((r) => [r.type, r.total]));

    return {
      videos: counts.video ?? 0,
      photos: counts.photo ?? 0,
      folders: counts.folder ?? 0,
      totalBytes: Number(totalSize?.bytes ?? 0),
      tags: tagCount,
      collections: collectionCount,
      videoTotal,
      videoMissing,
      videoBytes: Number(videoSize?.bytes ?? 0),
      videoDuplicateGroups: duplicateRows.rows[0]?.total ?? 0,
      lastScan: lastScan ?? null,
      lastBackup: lastBackup?.createdAt ?? null,
    };
  });
}
