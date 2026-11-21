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
import { isUniqueViolation } from "../db/errors.js";
import { studioDescendantIds, studioIdsUnder } from "../library/hierarchy.js";
import { normalizeName } from "../scanner/performerNames.js";

import { serialized } from "../auth/serialize.js";
import { profileId } from "../auth/profileContext.js";
import { performerIsFavorite } from "../library/profileState.js";
import { followedStudioIds, studioFollowedAt } from "../library/following.js";
import { isId, playbackJoin } from "./mediaItemQueries.js";
/**
 * Studios: who released a scene, derived from the filename's leading
 * [Studio] tag or the folder above it.
 *
 * The scanner creates and names them, the same way it owns performers. By
 * hand you can only add what a filename cannot say: a network to group sites
 * under, and a site's place in one.
 */
export async function studioRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Visible videos of a studio and every site under it: a network's page
   * is about the whole network, which usually has no videos of its own.
   */
  function studioVideos(studioId: number, videoTypeIds: ReturnType<typeof videoTypes>, profile: number) {
    return and(
      sql`${mediaItems.studioId} in ${studioIdsUnder(studioId)}`,
      visibleItems(profile),
      inArray(mediaItems.itemTypeId, videoTypeIds)
    );
  }

  function videoTypes() {
    return db
      .select({ id: mediaItemTypes.id })
      .from(mediaItemTypes)
      .where(eq(mediaItemTypes.name, "video"));
  }

  app.get("/api/studios", async (request) => {
    const profile = profileId(request);
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
        // A handful of frames drawn at random from every video the studio
        // has, so its cover changes from visit to visit and takes in new
        // videos as the studio grows, rather than one still forever. Capped
        // rather than every id: a card only needs something to choose
        // between, and a studio with hundreds of videos should not send
        // hundreds of numbers to pick one of them.
        //
        // The filter matters — a LEFT JOIN gives studios with no videos a
        // single NULL row, and array_agg would happily collect that.
        frameItemIds: sql<number[]>`coalesce(
          (array_agg(${mediaItems.id} order by random())
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
          visibleItems(profile),
          inArray(mediaItems.itemTypeId, videoTypeIds)
        )
      )
      .groupBy(studios.id, studios.name)
      // Plain name ordering is ASCII, which sorts "Vixen" before "blacked".
      .orderBy(sql`lower(${studios.name})`);

    const followed = await followedStudioIds(profile);
    const rolled = rollUpNetworks(rows, await db.select({ id: studios.id, parentId: studios.parentId }).from(studios));

    // Each frame's thumbnail version, so a card's image URL changes when its
    // thumbnail is replaced. Thumbnails are cached for a year by URL; an id
    // alone gives the same URL forever, and a new thumbnail never shows.
    const frameIds = [
      ...new Set(
        rolled.flatMap((studio) =>
          studio.representativeItemId == null
            ? studio.frameItemIds
            : [...studio.frameItemIds, studio.representativeItemId],
        ),
      ),
    ];
    const thumbnailFileOf = new Map(
      frameIds.length
        ? (
            await db
              .select({ id: mediaItems.id, thumbnailFile: mediaItems.thumbnailFile })
              .from(mediaItems)
              .where(inArray(mediaItems.id, frameIds))
          ).map((row) => [row.id, row.thumbnailFile])
        : [],
    );

    return {
      studios: rolled.map((studio) => {
        const ids = studio.representativeItemId == null
          ? studio.frameItemIds
          : [...studio.frameItemIds, studio.representativeItemId];
        return {
          ...studio,
          isFollowed: followed.has(studio.id),
          thumbnailFiles: Object.fromEntries(ids.map((id) => [id, thumbnailFileOf.get(id) ?? null])),
        };
      }),
    };
  });

  /**
   * Backs the studio page: the studio plus every aggregate its header needs,
   * in one request rather than five.
   */
  app.get<{ Params: { id: string } }>("/api/studios/:id", async (request, reply) => {
    const profile = profileId(request);
    const id = Number(request.params.id);

    const [studio] = await db
      .select({ id: studios.id, name: studios.name, parentId: studios.parentId, origin: studios.origin })
      .from(studios)
      .where(eq(studios.id, id));
    if (!studio) {
      reply.code(404);
      return { error: "Not found" };
    }

    const [parent] =
      studio.parentId === null
        ? []
        : await db
            .select({ id: studios.id, name: studios.name })
            .from(studios)
            .where(eq(studios.id, studio.parentId));
    // Direct sites only; each one's own page lists any further down.
    const sites = await db
      .select({ id: studios.id, name: studios.name })
      .from(studios)
      .where(eq(studios.parentId, id))
      .orderBy(sql`lower(${studios.name})`);

    const videoTypeIds = videoTypes();
    const belongsHere = studioVideos(id, videoTypeIds, profile);

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
      .leftJoin(playbackStates, playbackJoin(profile))
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
        isFavorite: performerIsFavorite(profile, performers.id),
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
        performerIsFavorite(profile, performers.id),
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
                visibleItems(profile),
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
      .where(sql`${albums.studioId} in ${studioIdsUnder(id)}`);

    return {
      id: studio.id,
      name: studio.name,
      origin: studio.origin,
      parent: parent ?? null,
      sites,
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
      // This profile's, like everything personal.
      followedAt: await studioFollowedAt(profile, studio.id),
    };
  });

  /**
   * A studio made by hand — in practice a network, since a site arrives with
   * its files. Marked 'user' so the end-of-scan purge, which clears studios
   * with no videos, leaves it alone.
   */
  app.post<{ Body: { name?: string; parentId?: number | null } }>("/api/studios", async (request, reply) => {
    const name = normalizeName(request.body?.name ?? "");
    if (!name) {
      reply.code(400);
      return { error: "name cannot be empty" };
    }
    const parentId = request.body?.parentId ?? null;
    if (parentId !== null) {
      const [parent] = isId(parentId)
        ? await db.select({ id: studios.id }).from(studios).where(eq(studios.id, parentId))
        : [];
      if (!parent) {
        reply.code(400);
        return { error: "That parent studio does not exist" };
      }
    }
    // Checked up front so a collision reads as a 409, not a raw unique-index
    // violation; the catch below covers a save racing this one.
    const [clash] = await db
      .select({ name: studios.name })
      .from(studios)
      .where(sql`lower(${studios.name}) = lower(${name})`);
    if (clash) {
      reply.code(409);
      return { error: `A studio named "${clash.name}" already exists` };
    }
    try {
      const [created] = await db.insert(studios).values({ name, parentId, origin: "user" }).returning();
      reply.code(201);
      return { studio: created };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      reply.code(409);
      return { error: `A studio named "${name}" already exists` };
    }
  });

  /** Which network a studio belongs to; null takes it out of one. */
  app.patch<{ Params: { id: string }; Body: { parentId?: number | null } }>(
    "/api/studios/:id",
    async (request, reply) => serialized("hierarchy", async () => {
      const id = Number(request.params.id);
      const [studio] = Number.isInteger(id)
        ? await db.select().from(studios).where(eq(studios.id, id))
        : [];
      if (!studio) {
        reply.code(404);
        return { error: "Not found" };
      }
      const body = request.body ?? {};

      const parentId = body.parentId;
      if (parentId !== undefined && parentId !== null) {
        if (!isId(parentId)) {
          reply.code(400);
          return { error: "parentId must be a studio id or null" };
        }
        if (parentId === id) {
          reply.code(400);
          return { error: "A studio cannot be its own network" };
        }
        const [parent] = await db.select({ name: studios.name }).from(studios).where(eq(studios.id, parentId));
        if (!parent) {
          reply.code(400);
          return { error: "That parent studio does not exist" };
        }
        // A site of this studio cannot also be its network: that is a loop.
        if ((await studioDescendantIds(id)).includes(parentId)) {
          reply.code(400);
          return { error: `"${parent.name}" is already under "${studio.name}", so it cannot also be above it` };
        }
      }

      if (parentId === undefined) {
        reply.code(400);
        return { error: "Nothing to update" };
      }

      await db.update(studios).set({ parentId }).where(eq(studios.id, id));
      return { ok: true };
    }),
  );
}

/**
 * Adds every site's videos to the networks above it, so a network's card
 * shows the network rather than its own (usually zero) videos. Done here
 * rather than in SQL because each video has one studio, so the counts add up
 * without overlap, and frames just merge. A visited set stops a loop a
 * restore might bring back from walking forever.
 */
/** A copy in random order (Fisher–Yates). */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function rollUpNetworks<
  T extends { id: number; videoCount: number; representativeItemId: number | null; frameItemIds: number[] },
>(rows: T[], links: { id: number; parentId: number | null }[]) {
  const parentOf = new Map(links.map((link) => [link.id, link.parentId]));
  const byId = new Map(
    rows.map((row) => [row.id, { ...row, parentId: parentOf.get(row.id) ?? null, frameItemIds: [...row.frameItemIds] }]),
  );
  for (const row of rows) {
    if (row.videoCount === 0) continue;
    const seen = new Set([row.id]);
    let up = parentOf.get(row.id) ?? null;
    while (up !== null && !seen.has(up)) {
      seen.add(up);
      const network = byId.get(up);
      if (network) {
        network.videoCount += row.videoCount;
        network.representativeItemId = Math.max(network.representativeItemId ?? 0, row.representativeItemId ?? 0) || null;
        // Shuffled, as each site's own sample is, so a network's cover draws
        // from all its sites rather than favouring the first one listed.
        network.frameItemIds = shuffle([...network.frameItemIds, ...row.frameItemIds]).slice(0, 8);
      }
      up = parentOf.get(up) ?? null;
    }
  }
  return [...byId.values()];
}
