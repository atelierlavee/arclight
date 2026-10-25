import { parsePage } from "./mediaItemQueries.js";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { visibleItems } from "../library/visibility.js";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { albums, mediaFiles, mediaItemTypes, mediaItems, performers, studios } from "../db/schema.js";

import { profileId } from "../auth/profileContext.js";
const PAGE_SIZE = 100;

/**
 * Albums: a directory of photos, with the video they belong to.
 *
 * The rows are built by the scanner (assignAlbums in scanner/pipeline.ts) —
 * nothing here creates or edits one, because the filesystem decides what an
 * album is.
 */
export async function albumRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { performer?: string; studio?: string } }>(
    "/api/albums",
    async (request) => {
    const profile = profileId(request);
    const performerFilter = request.query.performer?.trim();
    const studioFilter = request.query.studio?.trim();
    // Grouped, not a correlated subquery per row. Drizzle renders an
    // unaliased column unqualified, which is ambiguous inside a subquery, and
    // an alias is not a table outside the query declaring it — both mistakes
    // have already broken queries in this project.
    const rows = await db
      .select({
        id: albums.id,
        title: albums.title,
        performer: performers.name,
        studio: studios.name,
        photoCount: sql<number>`count(*) filter (where ${mediaItemTypes.name} = 'photo')::int`,
        // The hand-picked cover when there is one, otherwise the lowest id —
        // the first photo by scan order, which follows filename order, so a
        // numbered gallery shows its opening shot.
        //
        // The first filter only yields a row if the chosen photo is still one
        // of this album's visible photos, so a cover that went out of scope
        // or missing falls back on its own rather than rendering a dead tile.
        coverItemId: sql<number | null>`coalesce(
          min(${mediaItems.id}) filter (
            where ${mediaItemTypes.name} = 'photo' and ${mediaItems.id} = ${albums.coverItemId}
          ),
          min(${mediaItems.id}) filter (where ${mediaItemTypes.name} = 'photo')
        )`,
        videoItemId: sql<number | null>`min(${mediaItems.id}) filter (
          where ${mediaItemTypes.name} = 'video'
        )`,
        coverPositionX: albums.coverPositionX,
        coverPositionY: albums.coverPositionY,
        coverScale: albums.coverScale,
      })
      .from(albums)
      .leftJoin(
        mediaItems,
        and(eq(mediaItems.albumId, albums.id), visibleItems(profile))
      )
      .leftJoin(mediaItemTypes, eq(mediaItemTypes.id, mediaItems.itemTypeId))
      .leftJoin(performers, eq(performers.id, albums.performerId))
      .leftJoin(studios, eq(studios.id, albums.studioId))
      .where(
        and(
          // lower(...) = lower(...) rather than ilike: `_` is a LIKE wildcard
          // and a legal character in a name.
          performerFilter
            ? sql`lower(${performers.name}) = lower(${performerFilter})`
            : undefined,
          studioFilter ? sql`lower(${studios.name}) = lower(${studioFilter})` : undefined
        )
      )
      .groupBy(
        albums.id,
        albums.title,
        albums.coverPositionX,
        albums.coverPositionY,
        albums.coverScale,
        performers.name,
        studios.name
      )
      .orderBy(sql`lower(${albums.title})`);

      // An album whose photos all went out of scope has nothing to show; the
      // scanner purges it, but a folder removed since the last scan would
      // otherwise appear here as an empty card.
      return { albums: rows.filter((row) => row.photoCount > 0) };
    }
  );

  app.get<{ Params: { id: string }; Querystring: { page?: string } }>(
    "/api/albums/:id",
    async (request, reply) => {
      const profile = profileId(request);
      const id = Number(request.params.id);
      const pageNum = parsePage(request.query.page) ?? 1;

      const [album] = await db
        .select({
          id: albums.id,
          title: albums.title,
          performer: performers.name,
          studio: studios.name,
          // The explicit pick, not the effective cover: the grid marks which
          // photo was chosen, and null genuinely means "still automatic".
          coverItemId: albums.coverItemId,
          coverPositionX: albums.coverPositionX,
          coverPositionY: albums.coverPositionY,
          coverScale: albums.coverScale,
        })
        .from(albums)
        .leftJoin(performers, eq(performers.id, albums.performerId))
        .leftJoin(studios, eq(studios.id, albums.studioId))
        .where(eq(albums.id, id));

      if (!album) {
        reply.code(404);
        return { error: "Not found" };
      }

      // One row past the page size answers "is there more?" without a second
      // COUNT(*) — the same convention /api/media-items uses.
      const rows = await db
        .select({
          id: mediaItems.id,
          title: mediaItems.title,
          itemType: mediaItemTypes.name,
          thumbnailFile: mediaItems.thumbnailFile,
        })
        .from(mediaItems)
        .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
        .innerJoin(mediaFiles, eq(mediaFiles.mediaItemId, mediaItems.id))
        .where(
          and(
            eq(mediaItems.albumId, id),
            visibleItems(profile),
            eq(mediaItemTypes.name, "photo")
          )
        )
        // Filenames are usually numbered, so path order is the intended order.
        .orderBy(asc(mediaFiles.path))
        .limit(PAGE_SIZE + 1)
        .offset((pageNum - 1) * PAGE_SIZE);

      const hasMore = rows.length > PAGE_SIZE;

      const [video] = await db
        .select({ id: mediaItems.id, title: mediaItems.title })
        .from(mediaItems)
        .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
        .where(
          and(
            eq(mediaItems.albumId, id),
            visibleItems(profile),
            eq(mediaItemTypes.name, "video")
          )
        )
        .limit(1);

      return {
        ...album,
        video: video ?? null,
        photos: hasMore ? rows.slice(0, PAGE_SIZE) : rows,
        page: pageNum,
        pageSize: PAGE_SIZE,
        hasMore,
      };
    }
  );

  /**
   * Picks which photo represents the album, or clears back to automatic.
   *
   * The only editable thing about an album — everything else (its title,
   * performer, studio, membership) is the filesystem's to decide, and a
   * rescan would overwrite it. A cover is a display choice about photos that
   * already exist, so nothing the scanner does can disagree with it.
   */
  app.patch<{
    Params: { id: string };
    Body: {
      coverItemId?: number | null;
      coverPositionX?: number;
      coverPositionY?: number;
      coverScale?: number;
    };
  }>(
    "/api/albums/:id",
    async (request, reply) => {
      const profile = profileId(request);
      const id = Number(request.params.id);
      const { coverItemId, coverPositionX, coverPositionY, coverScale } = request.body ?? {};

      if (
        coverItemId !== undefined &&
        coverItemId !== null &&
        !Number.isInteger(coverItemId)
      ) {
        reply.code(400);
        return { error: "coverItemId must be a photo id, or null to clear it" };
      }

      // Checked rather than trusted: without this any item id would stick,
      // including a video or a photo from somebody else's album, and the
      // list query would then quietly fall back and look broken instead.
      if (coverItemId !== undefined && coverItemId !== null) {
        const [photo] = await db
          .select({ id: mediaItems.id })
          .from(mediaItems)
          .innerJoin(mediaItemTypes, eq(mediaItemTypes.id, mediaItems.itemTypeId))
          .where(
            and(
              eq(mediaItems.id, coverItemId),
              eq(mediaItems.albumId, id),
              visibleItems(profile),
              eq(mediaItemTypes.name, "photo")
            )
          );
        if (!photo) {
          reply.code(400);
          return { error: "That photo isn't in this album" };
        }
      }

      const [existing] = await db
        .select({ coverItemId: albums.coverItemId })
        .from(albums)
        .where(eq(albums.id, id));
      if (!existing) {
        reply.code(404);
        return { error: "Not found" };
      }

      const patch: Partial<typeof albums.$inferInsert> = {};
      if (coverItemId !== undefined) {
        patch.coverItemId = coverItemId;
        // A frame was chosen against one photo; on a different one it crops
        // somewhere arbitrary. Reset unless this same request supplies new
        // framing — which is what repositioning an automatic cover does, so
        // that pinning it doesn't wipe the framing being saved.
        if (coverItemId !== existing.coverItemId && coverPositionX === undefined) {
          patch.coverPositionX = 50;
          patch.coverPositionY = 50;
          patch.coverScale = 100;
        }
      }

      // Clamped rather than rejected: an out-of-range value is a client
      // rounding artefact, not something worth failing a save over. Same
      // treatment the performer framing gets.
      const clamp = (v: number, lo: number, hi: number) =>
        Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));
      if (coverPositionX !== undefined) patch.coverPositionX = clamp(coverPositionX, 0, 100);
      if (coverPositionY !== undefined) patch.coverPositionY = clamp(coverPositionY, 0, 100);
      // Floor of 100: below it the photo stops covering its card.
      if (coverScale !== undefined) patch.coverScale = clamp(coverScale, 100, 300);

      if (Object.keys(patch).length === 0) {
        reply.code(400);
        return { error: "Nothing to update" };
      }

      await db.update(albums).set(patch).where(eq(albums.id, id));
      return { ok: true, ...patch };
    }
  );
}
