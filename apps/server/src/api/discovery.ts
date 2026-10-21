import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, ne, notInArray, sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import {
  mediaItemPerformers,
  mediaItemTypes,
  mediaItems,
  performers,
  playbackStates,
  studios,
  watchLog,
} from "../db/schema.js";
import { notHidden, visibleItems } from "../library/visibility.js";
import {
  fetchRelated,
  HERO_LIMIT,
  itemColumnsFor,
  playbackColumns,
  playbackJoin,
  RELATED_LIMIT,
  WATCHED_PERCENT,
  withPlayback,
} from "./mediaItemQueries.js";
import { getHeroSettings } from "./settings.js";

import { profileId } from "../auth/profileContext.js";
import { itemFavoriteFilter, itemRating } from "../library/profileState.js";
export async function discoveryRoutes(app: FastifyInstance): Promise<void> {
  // Resolves the hero setting into actual items, so the homepage doesn't have
  // to know how the setting is shaped.
  app.get("/api/hero-items", async (request) => {
    const profile = profileId(request);
    const hero = await getHeroSettings();

    const base = db
      .select({ ...itemColumnsFor(profile), ...playbackColumns })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .leftJoin(studios, eq(studios.id, mediaItems.studioId))
      .leftJoin(playbackStates, playbackJoin(profile));

    let rows;
    if (hero.source === "manual") {
      if (hero.itemIds.length === 0) return { items: [] };
      const found = await base.where(
        and(
          eq(mediaItemTypes.name, "video"),
          visibleItems(profile),
          inArray(mediaItems.id, hero.itemIds)
        )
      );
      // Preserve the order you arranged them in, which SQL wouldn't.
      const byId = new Map(found.map((r) => [r.id, r]));
      rows = hero.itemIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
    } else if (hero.source === "favorites") {
      rows = await base
        .where(
          and(
            eq(mediaItemTypes.name, "video"),
            visibleItems(profile),
            itemFavoriteFilter(profile, mediaItems.id)
          )
        )
        .orderBy(desc(mediaItems.createdAt))
        .limit(HERO_LIMIT);
    } else {
      rows = await base
        .where(
          // Through visibleItems(profile) like the other two sources: spelling the
          // rule out here is how "recent" came to put vault items on the
          // homepage hero.
          and(eq(mediaItemTypes.name, "video"), visibleItems(profile))
        )
        .orderBy(desc(mediaItems.createdAt))
        .limit(HERO_LIMIT);
    }

    const related = await fetchRelated(rows.map((r) => r.id));
    return {
      items: rows.map((r) => ({
        ...withPlayback(r, related),
      })),
    };
  });

  // Backs the "Continue Watching" row — anything with real progress that
  // isn't essentially finished, most recently watched first.
  app.get("/api/continue-watching", async (request) => {
    const profile = profileId(request);
    const rows = await db
      .select({ ...itemColumnsFor(profile), ...playbackColumns })
      .from(playbackStates)
      .innerJoin(mediaItems, and(eq(mediaItems.id, playbackStates.mediaItemId), eq(playbackStates.profileId, profile)))
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .leftJoin(studios, eq(studios.id, mediaItems.studioId))
      .where(
        and(
          gt(playbackStates.positionSeconds, 15),
          visibleItems(profile),
          // Finished videos drop out of the row rather than sitting at the
          // front of it forever. A video with no known duration is kept —
          // better a stale entry than silently hiding something.
          isNull(playbackStates.completedAt),
          sql`(${mediaItems.durationSeconds} is null or ${playbackStates.positionSeconds} * 100 < ${mediaItems.durationSeconds} * ${WATCHED_PERCENT})`
        )
      )
      .orderBy(desc(playbackStates.updatedAt))
      .limit(RELATED_LIMIT);

    const related = await fetchRelated(rows.map((r) => r.id));
    return {
      items: rows.map((r) => ({
        ...withPlayback(r, related),
      })),
    };
  });

  app.get("/api/taste-twins", async (request) => {
    const profile = profileId(request);
    // Both halves only over visible items: what you watch in the vault must
    // not decide who the homepage suggests, and a twin shared only through a
    // hidden video would point straight at it.
    const topPerformers = await db
      .select({ performerId: mediaItemPerformers.performerId, watchTime: sql<number>`coalesce(sum(${watchLog.seconds}), 0)::int` })
      .from(mediaItemPerformers)
      .innerJoin(watchLog, and(eq(watchLog.mediaItemId, mediaItemPerformers.mediaItemId), eq(watchLog.profileId, profile)))
      .innerJoin(mediaItems, eq(mediaItems.id, mediaItemPerformers.mediaItemId))
      .where(visibleItems(profile))
      .groupBy(mediaItemPerformers.performerId)
      .orderBy(sql`coalesce(sum(${watchLog.seconds}), 0) desc`)
      .limit(10);

    const topIds = topPerformers.map((r) => r.performerId);
    if (topIds.length === 0) return { performers: [] };

    const otherCredits = db.$with("other_credits").as(
      db.selectDistinct({ mediaItemId: mediaItemPerformers.mediaItemId })
        .from(mediaItemPerformers)
        .innerJoin(mediaItems, eq(mediaItems.id, mediaItemPerformers.mediaItemId))
        .where(and(inArray(mediaItemPerformers.performerId, topIds), visibleItems(profile)))
    );

    const twins = await db
      .with(otherCredits)
      .select({
        id: performers.id,
        name: performers.name,
        hasImage: sql<boolean>`(${performers.imageFile} is not null)`,
        imagePositionX: performers.imagePositionX,
        imagePositionY: performers.imagePositionY,
        imageScale: performers.imageScale,
        avatarPositionX: performers.avatarPositionX,
        avatarPositionY: performers.avatarPositionY,
        avatarScale: performers.avatarScale,
        sharedCount: sql<number>`count(distinct ${otherCredits.mediaItemId})::int`,
      })
      .from(mediaItemPerformers)
      .innerJoin(otherCredits, eq(otherCredits.mediaItemId, mediaItemPerformers.mediaItemId))
      .innerJoin(performers, eq(performers.id, mediaItemPerformers.performerId))
      .where(
        and(
          notInArray(mediaItemPerformers.performerId, topIds),
          isNull(performers.archivedAt),
        )
      )
      .groupBy(performers.id)
      .orderBy(sql`count(distinct ${otherCredits.mediaItemId}) desc`)
      .limit(8);

    return { performers: twins };
  });

  app.get("/api/fun-stat", async (request) => {
    const profile = profileId(request);
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();

    // Hidden items' watch time and completions stay out of these, like the
    // items themselves: a figure that moves when you watch something in the
    // vault says that you did.
    const [totalRow] = await db
      .select({ total: sql<number>`coalesce(sum(${watchLog.seconds}), 0)::int` })
      .from(watchLog)
      .innerJoin(mediaItems, and(eq(mediaItems.id, watchLog.mediaItemId), eq(watchLog.profileId, profile)))
      .where(notHidden(profile));
    const totalSeconds = totalRow?.total ?? 0;

    const [watchedRow] = await db
      .select({ count: sql<number>`count(distinct ${playbackStates.mediaItemId})::int` })
      .from(playbackStates)
      .innerJoin(mediaItems, and(eq(mediaItems.id, playbackStates.mediaItemId), eq(playbackStates.profileId, profile)))
      .where(and(isNotNull(playbackStates.completedAt), notHidden(profile)));
    const watchedCount = watchedRow?.count ?? 0;

    const [unwatchedRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .leftJoin(playbackStates, playbackJoin(profile))
      .where(
        and(
          visibleItems(profile),
          ne(mediaItemTypes.name, "photo"),
          ne(mediaItemTypes.name, "folder"),
          isNull(playbackStates.completedAt),
        )
      );
    const unwatchedCount = unwatchedRow?.count ?? 0;

    const [studioRow] = await db
      .select({ count: sql<number>`count(distinct ${mediaItems.studioId})::int` })
      .from(mediaItems)
      .where(and(visibleItems(profile), isNotNull(mediaItems.studioId)));
    const studioCount = studioRow?.count ?? 0;

    const [avgRow] = await db
      .select({ avg: sql<number>`coalesce(avg(${mediaItems.durationSeconds}), 0)::int` })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .where(and(visibleItems(profile), ne(mediaItemTypes.name, "photo"), ne(mediaItemTypes.name, "folder"), isNotNull(mediaItems.durationSeconds)));
    const avgDuration = avgRow?.avg ?? 0;

    const [ratedRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mediaItems)
      .where(and(visibleItems(profile), isNotNull(itemRating(profile, mediaItems.id))));
    const ratedCount = ratedRow?.count ?? 0;

    const [fiveStarRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mediaItems)
      .where(and(visibleItems(profile), eq(itemRating(profile, mediaItems.id), 5)));
    const fiveStarCount = fiveStarRow?.count ?? 0;

    const stats: string[] = [];
    const totalHours = Math.round(totalSeconds / 3600);
    if (totalHours > 0) stats.push(`You've watched ${totalHours} hours in total — that's ${Math.round(totalHours / 24)} full days.`);
    if (watchedCount > 0) stats.push(`You've finished ${watchedCount} videos so far.`);
    if (unwatchedCount > 0) stats.push(`${unwatchedCount} videos in your library are still unwatched.`);
    if (studioCount > 0) stats.push(`Your library spans ${studioCount} different studios.`);
    if (avgDuration > 0) stats.push(`Your average video is ${Math.round(avgDuration / 60)} minutes long.`);
    if (ratedCount > 0) stats.push(`You've rated ${ratedCount} videos — ${fiveStarCount} of them got 5 stars.`);
    if (watchedCount > 0 && unwatchedCount > 0) {
      const pct = Math.round((watchedCount / (watchedCount + unwatchedCount)) * 100);
      stats.push(`You've seen ${pct}% of your video library.`);
    }

    if (stats.length === 0) return { stat: null };
    return { stat: stats[seed % stats.length] };
  });

  app.get("/api/forgotten-gems", async (request) => {
    const profile = profileId(request);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const rows = await db
      .select({ ...itemColumnsFor(profile), ...playbackColumns })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .leftJoin(studios, eq(studios.id, mediaItems.studioId))
      .innerJoin(playbackStates, playbackJoin(profile))
      .where(
        and(
          visibleItems(profile),
          sql`${itemRating(profile, mediaItems.id)} >= ${4}`,
          isNotNull(playbackStates.completedAt),
          sql`${playbackStates.updatedAt} < ${sixMonthsAgo}`,
          ne(mediaItemTypes.name, "photo"),
          ne(mediaItemTypes.name, "folder"),
        )
      )
      .orderBy(sql`${itemRating(profile, mediaItems.id)} desc`, sql`${playbackStates.updatedAt} asc`)
      .limit(RELATED_LIMIT);

    const related = await fetchRelated(rows.map((r) => r.id));
    return { items: rows.map((r) => withPlayback(r, related)) };
  });

  app.get("/api/streak", async (request) => {
    const profile = profileId(request);
    // Summed per hour in SQL: the widget only adds seconds up by local day,
    // so one row per hour carries everything it needs, where one row per
    // video per hour grew with every video ever watched. Hours rather than
    // days because only the browser knows the viewer's time zone. Hidden
    // items are left out so the vault leaves no trace on the homepage.
    const rows = await db
      .select({ hour: watchLog.hour, seconds: sql<number>`sum(${watchLog.seconds})::int` })
      .from(watchLog)
      .innerJoin(mediaItems, and(eq(mediaItems.id, watchLog.mediaItemId), eq(watchLog.profileId, profile)))
      .where(notHidden(profile))
      .groupBy(watchLog.hour)
      .orderBy(watchLog.hour);

    return { log: rows.map((r) => ({ hour: r.hour.toISOString(), seconds: r.seconds })) };
  });

  app.get<{ Querystring: { seed?: string } }>("/api/daily-pick", async (request) => {
    const profile = profileId(request);
    const today = new Date();
    const defaultSeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    const seed = request.query.seed ? Number(request.query.seed) || defaultSeed : defaultSeed;

    const baseQuery = db
      .select({ ...itemColumnsFor(profile), ...playbackColumns })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .leftJoin(studios, eq(studios.id, mediaItems.studioId))
      .leftJoin(playbackStates, playbackJoin(profile));

    // Prefer unwatched, fall back to any video if the pool is empty.
    let [row] = await baseQuery
      .where(
        and(
          visibleItems(profile),
          ne(mediaItemTypes.name, "photo"),
          ne(mediaItemTypes.name, "folder"),
          isNull(playbackStates.completedAt),
        )
      )
      .orderBy(sql`md5(${mediaItems.id}::text || ${String(seed)})`)
      .limit(1);

    if (!row) {
      [row] = await baseQuery
        .where(
          and(
            visibleItems(profile),
            ne(mediaItemTypes.name, "photo"),
            ne(mediaItemTypes.name, "folder"),
          )
        )
        .orderBy(sql`md5(${mediaItems.id}::text || ${String(seed)})`)
        .limit(1);
    }

    if (!row) return { item: null };

    const related = await fetchRelated([row.id]);
    return { item: withPlayback(row, related) };
  });

  app.get("/api/on-this-day", async (request) => {
    const profile = profileId(request);
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    const rows = await db
      .select({ ...itemColumnsFor(profile), ...playbackColumns, completedYear: sql<number>`extract(year from ${playbackStates.completedAt})::int` })
      .from(playbackStates)
      .innerJoin(mediaItems, and(eq(mediaItems.id, playbackStates.mediaItemId), eq(playbackStates.profileId, profile)))
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .leftJoin(studios, eq(studios.id, mediaItems.studioId))
      .where(
        and(
          isNotNull(playbackStates.completedAt),
          sql`extract(month from ${playbackStates.completedAt}) = ${month}`,
          sql`extract(day from ${playbackStates.completedAt}) = ${day}`,
          sql`extract(year from ${playbackStates.completedAt}) < extract(year from now())`,
          visibleItems(profile),
        )
      )
      .orderBy(desc(playbackStates.completedAt))
      .limit(RELATED_LIMIT);

    const related = await fetchRelated(rows.map((r) => r.id));
    return {
      items: rows.map((r) => ({
        ...withPlayback(r, related),
        completedYear: r.completedYear,
      })),
    };
  });
}
