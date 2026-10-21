import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import {
  albums,
  mediaItemPerformers,
  mediaItems,
  mediaItemTypes,
  performers,
  playbackStates,
  studios,
} from "../db/schema.js";
import { visibleItems } from "../library/visibility.js";

/**
 * Studios: who released a scene, derived from the filename's leading
 * [Studio] tag or the folder above it.
 *
 * Nothing here creates or renames one — the scanner owns that, the same way
 * it owns performers. These endpoints only read.
 */
export async function studioRoutes(app: FastifyInstance): Promise<void> {
  /** Videos of a given studio that are actually visible in the library. */
  function studioVideos(studioId: number, videoTypeIds: ReturnType<typeof videoTypes>) {
    return and(
      eq(mediaItems.studioId, studioId),
      visibleItems(),
      inArray(mediaItems.itemTypeId, videoTypeIds)
    );
  }

  function videoTypes() {
    return db
      .select({ id: mediaItemTypes.id })
      .from(mediaItemTypes)
      .where(eq(mediaItemTypes.name, "video"));
  }

  app.get("/api/studios", async () => {
    const videoTypeIds = videoTypes();

    const rows = await db
      .select({
        id: studios.id,
        name: studios.name,
        // count(<column>) not count(*): a LEFT JOIN with no match would
        // otherwise report 1 for a studio with nothing attached.
        videoCount: sql<number>`count(${mediaItems.id})::int`,
        // A frame to put on the card. Highest id is the most recently
        // scanned, which is the freshest thing the studio has.
        representativeItemId: sql<number | null>`max(${mediaItems.id})`,
        // A handful of recent frames, so a card can show a different one each
        // time instead of the same still forever. Capped rather than every
        // id: the homepage only needs something to choose between, and a
        // studio with hundreds of videos should not send hundreds of numbers
        // to pick one of them.
        //
        // The filter matters — a LEFT JOIN gives studios with no videos a
        // single NULL row, and array_agg would happily collect that.
        frameItemIds: sql<number[]>`coalesce(
          (array_agg(${mediaItems.id} order by ${mediaItems.id} desc)
            filter (where ${mediaItems.id} is not null))[1:8],
          '{}'
        )`,
      })
      .from(studios)
      // Videos only. Without the type restriction this counted an album's
      // stills too — Vixen read as 553 where it has 8 scenes and 545 photos,
      // and the card's frame was whichever photo scanned last. The predicates
      // belong in the join condition, not a WHERE: in a WHERE they would drop
      // studios with no videos entirely.
      .leftJoin(
        mediaItems,
        and(
          eq(mediaItems.studioId, studios.id),
          visibleItems(),
          inArray(mediaItems.itemTypeId, videoTypeIds)
        )
      )
      .groupBy(studios.id, studios.name)
      // Plain name ordering is ASCII, which sorts "Vixen" before "blacked".
      .orderBy(sql`lower(${studios.name})`);
    return { studios: rows };
  });

  /**
   * Backs the studio page: the studio plus every aggregate its header needs,
   * in one request rather than five.
   */
  app.get<{ Params: { id: string } }>("/api/studios/:id", async (request, reply) => {
    const id = Number(request.params.id);

    const [studio] = await db
      .select({ id: studios.id, name: studios.name })
      .from(studios)
      .where(eq(studios.id, id));
    if (!studio) {
      reply.code(404);
      return { error: "Not found" };
    }

    const videoTypeIds = videoTypes();
    const belongsHere = studioVideos(id, videoTypeIds);

    const [totals] = await db
      .select({
        videoCount: sql<number>`count(*)::int`,
        totalDurationSeconds: sql<number>`coalesce(sum(${mediaItems.durationSeconds}), 0)::int`,
      })
      .from(mediaItems)
      .where(belongsHere);

    // `year` is nullable on purpose — undated videos need a bucket of their
    // own or they vanish from a grouped view.
    const yearBreakdown = await db
      .select({
        year: sql<number | null>`extract(year from ${mediaItems.releaseDate})::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(mediaItems)
      .where(belongsHere)
      .groupBy(sql`extract(year from ${mediaItems.releaseDate})`)
      .orderBy(desc(sql`extract(year from ${mediaItems.releaseDate})`));

    const [watch] = await db
      .select({
        watched: sql<number>`count(*) filter (where ${playbackStates.completedAt} is not null)::int`,
        inProgress: sql<number>`count(*) filter (
          where ${playbackStates.positionSeconds} > 15 and ${playbackStates.completedAt} is null
        )::int`,
        unwatched: sql<number>`count(*) filter (where ${playbackStates.id} is null)::int`,
      })
      .from(mediaItems)
      .leftJoin(playbackStates, eq(playbackStates.mediaItemId, mediaItems.id))
      .where(belongsHere);

    // Who appears on this studio's videos, most-credited first. A LEFT JOIN
    // with GROUP BY rather than a correlated subquery in the select list —
    // drizzle renders an unaliased column unqualified, which is ambiguous
    // inside a subquery and fails outright. That mistake has broken three
    // queries in this project.
    const performerRows = await db
      .select({
        id: performers.id,
        name: performers.name,
        isFavorite: performers.isFavorite,
        hasImage: sql<boolean>`(${performers.imageFile} is not null)`,
        hasBanner: sql<boolean>`(${performers.bannerFile} is not null)`,
        imagePositionX: performers.imagePositionX,
        imagePositionY: performers.imagePositionY,
        imageScale: performers.imageScale,
        representativeItemId: sql<number | null>`max(${mediaItems.id})`,
        /** How many of this studio's videos they're on. */
        together: sql<number>`count(*)::int`,
      })
      .from(mediaItemPerformers)
      .innerJoin(mediaItems, and(eq(mediaItems.id, mediaItemPerformers.mediaItemId), belongsHere))
      .innerJoin(performers, eq(performers.id, mediaItemPerformers.performerId))
      .groupBy(
        performers.id,
        performers.name,
        performers.isFavorite,
        performers.imageFile,
        performers.bannerFile,
        performers.imagePositionX,
        performers.imagePositionY,
        performers.imageScale
      )
      .orderBy(desc(sql`count(*)`), sql`lower(${performers.name})`);

    // Their own catalogue size, as one grouped query rather than a subquery
    // per row — the same shape the co-performer totals use.
    const performerIds = performerRows.map((row) => row.id);
    const ownTotals =
      performerIds.length === 0
        ? []
        : await db
            .select({
              performerId: mediaItemPerformers.performerId,
              videoCount: sql<number>`count(*)::int`,
            })
            .from(mediaItemPerformers)
            .innerJoin(
              mediaItems,
              and(
                eq(mediaItems.id, mediaItemPerformers.mediaItemId),
                visibleItems(),
                inArray(mediaItems.itemTypeId, videoTypeIds)
              )
            )
            .where(inArray(mediaItemPerformers.performerId, performerIds))
            .groupBy(mediaItemPerformers.performerId);
    const totalByPerformerId = new Map(ownTotals.map((row) => [row.performerId, row.videoCount]));

    // Two of the studio's frames: one for the portrait tile and a different
    // one behind it, so the backdrop isn't the same picture twice.
    const recentItems = await db
      .select({ id: mediaItems.id })
      .from(mediaItems)
      .where(belongsHere)
      .orderBy(desc(mediaItems.id))
      .limit(2);

    const [albumTotals] = await db
      .select({ albumCount: sql<number>`count(*)::int` })
      .from(albums)
      .where(eq(albums.studioId, id));

    return {
      id: studio.id,
      name: studio.name,
      videoCount: totals?.videoCount ?? 0,
      totalDurationSeconds: totals?.totalDurationSeconds ?? 0,
      albumCount: albumTotals?.albumCount ?? 0,
      years: yearBreakdown,
      watch: watch ?? { watched: 0, inProgress: 0, unwatched: 0 },
      performers: performerRows.map((row) => ({
        ...row,
        videoCount: totalByPerformerId.get(row.id) ?? 0,
      })),
      representativeItemId: recentItems[0]?.id ?? null,
      bannerItemId: recentItems[1]?.id ?? recentItems[0]?.id ?? null,
    };
  });
}
