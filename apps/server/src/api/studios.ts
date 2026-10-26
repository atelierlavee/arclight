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
  studioAliases,
  studios,
} from "../db/schema.js";
import { visibleItems } from "../library/visibility.js";
import { isUniqueViolation } from "../db/errors.js";
import { studioDescendantIds, studioIdsUnder } from "../library/hierarchy.js";
import { studioNameOwner } from "../library/studioLookup.js";
import { normalizeName } from "../scanner/performerNames.js";
import { parseAliases } from "./performerDetails.js";

import { profileId } from "../auth/profileContext.js";
import { performerIsFavorite } from "../library/profileState.js";
import { playbackJoin } from "./mediaItemQueries.js";
/**
 * Studios: who released a scene, derived from the filename's leading
 * [Studio] tag or the folder above it.
 *
 * The scanner creates and names them, the same way it owns performers. By
 * hand you can only add what a filename cannot say: a network to group sites
 * under, a site's place in one, and other spellings of its name.
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
          visibleItems(profile),
          inArray(mediaItems.itemTypeId, videoTypeIds)
        )
      )
      .groupBy(studios.id, studios.name)
      // Plain name ordering is ASCII, which sorts "Vixen" before "blacked".
      .orderBy(sql`lower(${studios.name})`);

    return { studios: rollUpNetworks(rows, await db.select({ id: studios.id, parentId: studios.parentId }).from(studios)) };
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
    const aliases = await db
      .select({ alias: studioAliases.alias })
      .from(studioAliases)
      .where(eq(studioAliases.studioId, id))
      .orderBy(sql`lower(${studioAliases.alias})`);

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
      aliases: aliases.map((row) => row.alias),
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
      const [parent] = Number.isInteger(parentId)
        ? await db.select({ id: studios.id }).from(studios).where(eq(studios.id, parentId))
        : [];
      if (!parent) {
        reply.code(400);
        return { error: "That parent studio does not exist" };
      }
    }
    const clash = await studioNameOwner(name, null);
    if (clash) {
      reply.code(409);
      return { error: clash.name.toLowerCase() === name.toLowerCase()
        ? `A studio named "${clash.name}" already exists`
        : `"${name}" is already an alias of ${clash.name}` };
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

  /**
   * Which network a studio belongs to, and its other spellings. The alias
   * list replaces the old one, as the editor sends the whole list.
   */
  app.patch<{ Params: { id: string }; Body: { parentId?: number | null; aliases?: string[] } }>(
    "/api/studios/:id",
    async (request, reply) => {
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
        if (!Number.isInteger(parentId)) {
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

      let aliases: string[] | undefined;
      if (body.aliases !== undefined) {
        const parsed = parseAliases(body.aliases, studio.name);
        if (!parsed.ok) {
          reply.code(400);
          return { error: parsed.error };
        }
        for (const alias of parsed.value) {
          const owner = await studioNameOwner(alias, id);
          if (owner) {
            reply.code(409);
            return { error: `"${alias}" already belongs to ${owner.name}` };
          }
        }
        aliases = parsed.value;
      }

      if (parentId === undefined && aliases === undefined) {
        reply.code(400);
        return { error: "Nothing to update" };
      }

      try {
        await db.transaction(async (tx) => {
          if (parentId !== undefined) {
            await tx.update(studios).set({ parentId }).where(eq(studios.id, id));
          }
          if (aliases !== undefined) {
            await tx.delete(studioAliases).where(eq(studioAliases.studioId, id));
            if (aliases.length > 0) {
              await tx.insert(studioAliases).values(aliases.map((alias) => ({ studioId: id, alias })));
            }
          }
        });
      } catch (error) {
        // Two saves racing for one alias: the unique index decides.
        if (!isUniqueViolation(error)) throw error;
        reply.code(409);
        return { error: "That alias was just taken by another studio" };
      }
      return { ok: true };
    },
  );
}

/**
 * Adds every site's videos to the networks above it, so a network's card
 * shows the network rather than its own (usually zero) videos. Done here
 * rather than in SQL because each video has one studio, so the counts add up
 * without overlap, and frames just merge. A visited set stops a loop a
 * restore might bring back from walking forever.
 */
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
        network.frameItemIds = [...network.frameItemIds, ...row.frameItemIds].sort((a, b) => b - a).slice(0, 8);
      }
      up = parentOf.get(up) ?? null;
    }
  }
  return [...byId.values()];
}
