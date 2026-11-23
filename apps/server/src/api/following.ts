// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import {
  mediaItemTypes,
  mediaItems,
  performers,
  playbackStates,
  profilePerformerState,
  studios,
} from "../db/schema.js";
import { profileId } from "../auth/profileContext.js";
import { itemFromFollowed, setPerformerFollowed, setStudioFollowed } from "../library/following.js";
import { awaitingApproval, reachableItems, visibleItems, visibleItemsSql } from "../library/visibility.js";
import { itemNote } from "../library/profileState.js";
import {
  fetchRelated,
  itemColumnsFor,
  PAGE_SIZE,
  parseId,
  parsePage,
  playbackColumns,
  playbackJoin,
  withPlayback,
} from "./mediaItemQueries.js";

/** How far back "new from who you follow" looks, in days. */
export const FOLLOWING_NEW_DAYS = 7;

/** "Most watched this month" looks back this far, in days. */
export const FOLLOWING_RECENT_DAYS = 30;

/** Followed but not watched for this long, in days, counts as gone quiet. */
export const FOLLOWING_QUIET_DAYS = 60;

/** Trending tags look at what arrived this far back, in days. */
export const FOLLOWING_TRENDING_DAYS = 30;

/** How many waiting videos "Coming up" lists. */
const UPCOMING_LIMIT = 12;

/** How many trending tags to list. */
const FOLLOWING_TRENDING_LIMIT = 10;

/**
 * Following performers and studios, per profile.
 *
 * The items themselves are listed through GET /api/media-items?following=true,
 * so they get every sort and filter the browse page has. What lives here is
 * the switch and the count the notification bell shows.
 */
export async function followingRoutes(app: FastifyInstance): Promise<void> {
  app.put<{ Params: { id: string }; Body: { follow: boolean } }>(
    "/api/performers/:id/follow",
    async (request, reply) => {
      const id = parseId(request.params.id);
      const follow = (request.body as { follow?: unknown } | undefined)?.follow;
      if (typeof follow !== "boolean") {
        reply.code(400);
        return { error: "follow must be a boolean" };
      }
      const [performer] =
        id === null ? [] : await db.select({ id: performers.id }).from(performers).where(eq(performers.id, id));
      if (!performer) {
        reply.code(404);
        return { error: "Not found" };
      }
      const followedAt = await setPerformerFollowed(profileId(request), performer.id, follow);
      return { ok: true, followedAt };
    },
  );

  app.put<{ Params: { id: string }; Body: { follow: boolean } }>(
    "/api/studios/:id/follow",
    async (request, reply) => {
      const id = parseId(request.params.id);
      const follow = (request.body as { follow?: unknown } | undefined)?.follow;
      if (typeof follow !== "boolean") {
        reply.code(400);
        return { error: "follow must be a boolean" };
      }
      const [studio] =
        id === null ? [] : await db.select({ id: studios.id }).from(studios).where(eq(studios.id, id));
      if (!studio) {
        reply.code(404);
        return { error: "Not found" };
      }
      const followedAt = await setStudioFollowed(profileId(request), studio.id, follow);
      return { ok: true, followedAt };
    },
  );

  /**
   * Everyone and every studio this profile follows, with what they have in
   * the library: videos in all, unwatched ones that arrived in the last
   * week, and when the latest arrived. Latest first, so who has something
   * new leads. A studio's figures include every site under it.
   */
  app.get("/api/following", async (request) => {
    const profile = profileId(request);
    const visible = visibleItemsSql("mi", profile);
    const isVideo = sql`mi.item_type_id in (select id from media_item_types where name = 'video')`;
    const isNew = sql`mi.created_at >= now() - make_interval(days => ${FOLLOWING_NEW_DAYS})
      and not exists (
        select 1 from playback_states ps
        where ps.media_item_id = mi.id and ps.profile_id = ${profile} and ps.completed_at is not null
      )`;

    const performerRows = await db.execute<{
      id: number;
      name: string;
      hasImage: boolean;
      hasBanner: boolean;
      followedAt: string;
      videoCount: number;
      newCount: number;
      latestAt: string | null;
      representativeItemId: number | null;
    }>(sql`
      select p.id, p.name, (p.image_file is not null) as "hasImage", (p.banner_file is not null) as "hasBanner",
        pps.followed_at as "followedAt",
        count(mi.id)::int as "videoCount",
        (count(mi.id) filter (where ${isNew}))::int as "newCount",
        max(mi.created_at) as "latestAt",
        max(mi.id) as "representativeItemId"
      from profile_performer_state pps
      join performers p on p.id = pps.performer_id
      left join media_item_performers mip on mip.performer_id = p.id
      left join media_items mi on mi.id = mip.media_item_id and ${visible} and ${isVideo}
      where pps.profile_id = ${profile} and pps.followed_at is not null
      group by p.id, pps.followed_at
      order by max(mi.created_at) desc nulls last, lower(p.name)
    `);

    const studioRows = await db.execute<{
      id: number;
      name: string;
      followedAt: string;
      videoCount: number;
      newCount: number;
      latestAt: string | null;
      representativeItemId: number | null;
    }>(sql`
      select s.id, s.name, pss.followed_at as "followedAt",
        count(mi.id)::int as "videoCount",
        (count(mi.id) filter (where ${isNew}))::int as "newCount",
        max(mi.created_at) as "latestAt",
        max(mi.id) as "representativeItemId"
      from profile_studio_state pss
      join studios s on s.id = pss.studio_id
      left join lateral (
        with recursive under(id) as (
          select s.id
          union
          select c.id from studios c join under u on c.parent_id = u.id
        )
        select id from under
      ) site on true
      left join media_items mi on mi.studio_id = site.id and ${visible} and ${isVideo}
      where pss.profile_id = ${profile} and pss.followed_at is not null
      group by s.id, pss.followed_at
      order by max(mi.created_at) desc nulls last, lower(s.name)
    `);

    return { performers: performerRows.rows, studios: studioRows.rows, days: FOLLOWING_NEW_DAYS };
  });

  /**
   * Who this profile might want to follow: performers and studios it already
   * spends time on but does not follow. Scored from its own history only —
   * hours watched, plays, counts, favourited videos, stars — so it says
   * nothing another profile could not see for itself.
   *
   * Each suggestion carries the figures behind it, so the page can say why
   * ("6 hours watched · 4 favourites") rather than just "recommended".
   */
  app.get("/api/following/suggestions", async (request) => {
    const profile = profileId(request);
    const mine = sql`
      select mi.id, mi.studio_id,
        coalesce(w.seconds, 0) as secs,
        coalesce(ps.play_count, 0) as plays,
        pis.rating,
        coalesce(pis.o_count, 0) as o,
        coalesce(pis.is_favorite, false) as fav
      from media_items mi
      left join (
        select media_item_id, sum(seconds) as seconds
        from watch_log where profile_id = ${profile} group by media_item_id
      ) w on w.media_item_id = mi.id
      left join playback_states ps on ps.media_item_id = mi.id and ps.profile_id = ${profile}
      left join profile_item_state pis on pis.media_item_id = mi.id and pis.profile_id = ${profile}
      where ${visibleItemsSql("mi", profile)}
        and mi.item_type_id in (select id from media_item_types where name = 'video')
    `;
    // Hours count double, a count triple: those are the strongest signals of
    // actually liking something. A star rating adds its average once.
    const figures = sql`
      sum(m.secs)::int as "secondsWatched",
      sum(m.plays)::int as "plays",
      sum(m.o)::int as "oCount",
      (count(*) filter (where m.fav))::int as "favouriteVideos",
      round(avg(m.rating)::numeric, 1)::float as "averageRating",
      count(*)::int as "videoCount",
      max(m.id) as "representativeItemId"
    `;
    const score = sql`(sum(m.secs) / 3600.0 * 2 + sum(m.plays) + sum(m.o) * 3
      + (count(*) filter (where m.fav)) * 2 + coalesce(avg(m.rating), 0))`;
    const engaged = sql`(sum(m.secs) + sum(m.plays) + sum(m.o) + (count(*) filter (where m.fav))) > 0`;

    const performerRows = await db.execute(sql`
      with mine as (${mine})
      select p.id, p.name, (p.image_file is not null) as "hasImage", (p.banner_file is not null) as "hasBanner",
        coalesce(bool_or(pps_fav.is_favorite), false) as "isFavorite",
        ${figures}
      from mine m
      join media_item_performers mip on mip.media_item_id = m.id
      join performers p on p.id = mip.performer_id
      left join profile_performer_state pps_fav
        on pps_fav.performer_id = p.id and pps_fav.profile_id = ${profile}
      where p.archived_at is null
        and not exists (
          select 1 from profile_performer_state pps
          where pps.profile_id = ${profile} and pps.performer_id = p.id and pps.followed_at is not null
        )
      group by p.id
      having ${engaged}
      order by ${score} + case when coalesce(bool_or(pps_fav.is_favorite), false) then 5 else 0 end desc, lower(p.name)
      limit 8
    `);

    // A studio already covered by a followed network is not a suggestion.
    const studioRows = await db.execute(sql`
      with recursive covered(id) as (
        select pss.studio_id from profile_studio_state pss
        where pss.profile_id = ${profile} and pss.followed_at is not null
        union
        select c.id from studios c join covered u on c.parent_id = u.id
      ),
      mine as (${mine})
      select s.id, s.name, ${figures}
      from mine m
      join studios s on s.id = m.studio_id
      where s.id not in (select id from covered)
      group by s.id
      having ${engaged}
      order by ${score} desc, lower(s.name)
      limit 6
    `);

    return { performers: performerRows.rows, studios: studioRows.rows };
  });

  /**
   * Following, as the stats page tells it: how much of this profile's
   * watching is of who it follows, who it watched most this month, and who
   * it follows but has not watched in a long while — a hint to unfollow.
   *
   * Built from the watch log, so only time watched since the log existed
   * counts, as everywhere else on that page. Vault items are left out.
   */
  app.get("/api/following/stats", async (request) => {
    const profile = profileId(request);
    const visible = visibleItemsSql("mi", profile);
    const isVideo = sql`mi.item_type_id in (select id from media_item_types where name = 'video')`;
    const followedItem = itemFromFollowed(profile, sql`mi.id`, sql`mi.studio_id`);
    const recent = sql`w.hour >= now() - make_interval(days => ${FOLLOWING_RECENT_DAYS})`;

    const [counts] = (
      await db.execute<{ performers: number; studios: number }>(sql`
        select
          (select count(*) from profile_performer_state where profile_id = ${profile} and followed_at is not null)::int as performers,
          (select count(*) from profile_studio_state where profile_id = ${profile} and followed_at is not null)::int as studios
      `)
    ).rows;

    const [share] = (
      await db.execute<{ total: number; followed: number; recentTotal: number; recentFollowed: number }>(sql`
        select
          coalesce(sum(w.seconds), 0)::int as total,
          coalesce(sum(w.seconds) filter (where ${followedItem}), 0)::int as followed,
          coalesce(sum(w.seconds) filter (where ${recent}), 0)::int as "recentTotal",
          coalesce(sum(w.seconds) filter (where ${recent} and ${followedItem}), 0)::int as "recentFollowed"
        from watch_log w
        join media_items mi on mi.id = w.media_item_id
        where w.profile_id = ${profile} and ${visible}
      `)
    ).rows;

    const topPerformers = await db.execute(sql`
      select p.id, p.name, (p.image_file is not null) as "hasImage", (p.banner_file is not null) as "hasBanner",
        sum(w.seconds)::int as seconds
      from watch_log w
      join media_items mi on mi.id = w.media_item_id and ${visible}
      join media_item_performers mip on mip.media_item_id = mi.id
      join performers p on p.id = mip.performer_id
      join profile_performer_state pps
        on pps.performer_id = p.id and pps.profile_id = ${profile} and pps.followed_at is not null
      where w.profile_id = ${profile} and ${recent}
      group by p.id
      order by seconds desc, lower(p.name)
      limit 5
    `);

    const topStudios = await db.execute(sql`
      select s.id, s.name, sum(w.seconds)::int as seconds
      from profile_studio_state pss
      join studios s on s.id = pss.studio_id
      join lateral (
        with recursive under(id) as (
          select s.id
          union
          select c.id from studios c join under u on c.parent_id = u.id
        )
        select id from under
      ) site on true
      join media_items mi on mi.studio_id = site.id and ${visible}
      join watch_log w on w.media_item_id = mi.id and w.profile_id = ${profile} and ${recent}
      where pss.profile_id = ${profile} and pss.followed_at is not null
      group by s.id
      order by seconds desc, lower(s.name)
      limit 5
    `);

    // Quiet since the later of the last watch and the follow, so someone
    // followed yesterday is not already "quiet".
    const quietSince = sql`coalesce(max(w.hour), pps.followed_at)`;
    const quietPerformers = await db.execute(sql`
      select p.id, p.name, (p.image_file is not null) as "hasImage", (p.banner_file is not null) as "hasBanner",
        pps.followed_at as "followedAt", max(w.hour) as "lastWatchedAt",
        count(distinct mi.id)::int as "videoCount"
      from profile_performer_state pps
      join performers p on p.id = pps.performer_id
      left join media_item_performers mip on mip.performer_id = p.id
      left join media_items mi on mi.id = mip.media_item_id and ${visible} and ${isVideo}
      left join watch_log w on w.media_item_id = mi.id and w.profile_id = ${profile}
      where pps.profile_id = ${profile} and pps.followed_at is not null
      group by p.id, pps.followed_at
      having ${quietSince} < now() - make_interval(days => ${FOLLOWING_QUIET_DAYS})
      order by ${quietSince} asc
      limit 8
    `);

    const quietStudios = await db.execute(sql`
      select s.id, s.name, pss.followed_at as "followedAt", max(w.hour) as "lastWatchedAt",
        count(distinct mi.id)::int as "videoCount"
      from profile_studio_state pss
      join studios s on s.id = pss.studio_id
      join lateral (
        with recursive under(id) as (
          select s.id
          union
          select c.id from studios c join under u on c.parent_id = u.id
        )
        select id from under
      ) site on true
      left join media_items mi on mi.studio_id = site.id and ${visible} and ${isVideo}
      left join watch_log w on w.media_item_id = mi.id and w.profile_id = ${profile}
      where pss.profile_id = ${profile} and pss.followed_at is not null
      group by s.id, pss.followed_at
      having coalesce(max(w.hour), pss.followed_at) < now() - make_interval(days => ${FOLLOWING_QUIET_DAYS})
      order by coalesce(max(w.hour), pss.followed_at) asc
      limit 8
    `);

    return {
      following: { performers: counts?.performers ?? 0, studios: counts?.studios ?? 0 },
      share: share ?? { total: 0, followed: 0, recentTotal: 0, recentFollowed: 0 },
      top: { performers: topPerformers.rows, studios: topStudios.rows },
      quiet: { performers: quietPerformers.rows, studios: quietStudios.rows },
      recentDays: FOLLOWING_RECENT_DAYS,
      quietDays: FOLLOWING_QUIET_DAYS,
    };
  });

  /**
   * The feed: every video from who this profile follows, newest release
   * first, a page at a time — with, for each, who it is here because of.
   *
   * The reasons are the followed performers in the video and the followed
   * studio it falls under — the nearest one, so a site followed in its own
   * right is named over the network it belongs to.
   */
  app.get<{
    Querystring: { page?: string; unwatched?: string; performer?: string; studio?: string; order?: string };
  }>(
    "/api/following/feed",
    async (request, reply) => {
      const profile = profileId(request);
      const page = parsePage(request.query.page);
      if (page === null) {
        reply.code(400);
        return { error: "page must be a positive whole number" };
      }
      const unwatchedOnly = request.query.unwatched === "true";
      // Narrowed to one performer, or one studio and every site under it.
      const performer = request.query.performer === undefined ? undefined : parseId(request.query.performer);
      const studio = request.query.studio === undefined ? undefined : parseId(request.query.studio);
      if (performer === null || studio === null) {
        reply.code(400);
        return { error: "performer and studio must be ids" };
      }
      const byArrival = request.query.order === "added";

      const rows = await db
        .select({
          ...itemColumnsFor(profile),
          ...playbackColumns,
          studioId: mediaItems.studioId,
          note: itemNote(profile, mediaItems.id),
        })
        .from(mediaItems)
        .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
        .leftJoin(studios, eq(studios.id, mediaItems.studioId))
        .leftJoin(playbackStates, playbackJoin(profile))
        .where(
          and(
            visibleItems(profile),
            eq(mediaItemTypes.name, "video"),
            itemFromFollowed(profile, mediaItems.id, mediaItems.studioId),
            unwatchedOnly ? isNull(playbackStates.completedAt) : undefined,
            performer === undefined
              ? undefined
              : sql`exists (select 1 from media_item_performers mip
                  where mip.media_item_id = ${mediaItems.id} and mip.performer_id = ${performer})`,
            studio === undefined
              ? undefined
              : sql`${mediaItems.studioId} in (
                  with recursive under(id) as (
                    select ${studio}::int
                    union
                    select c.id from studios c join under u on c.parent_id = u.id
                  )
                  select id from under
                )`,
          ),
        )
        // Newest release first by default. Undated videos go last rather than
        // first: an unknown date is not "the latest". Arrival breaks ties.
        // order=added is plain newest arrival first.
        .orderBy(
          ...(byArrival
            ? [desc(mediaItems.createdAt), desc(mediaItems.id)]
            : [sql`${mediaItems.releaseDate} desc nulls last`, desc(mediaItems.createdAt), desc(mediaItems.id)]),
        )
        .limit(PAGE_SIZE + 1)
        .offset((page - 1) * PAGE_SIZE);

      const hasMore = rows.length > PAGE_SIZE;
      const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
      const related = await fetchRelated(pageRows.map((row) => row.id));

      // Followed performers, with what the feed needs to draw their avatar.
      const followedPerformers = new Map(
        (
          await db
            .select({
              id: performers.id,
              hasImage: sql<boolean>`(${performers.imageFile} is not null)`,
              hasBanner: sql<boolean>`(${performers.bannerFile} is not null)`,
            })
            .from(profilePerformerState)
            .innerJoin(performers, eq(performers.id, profilePerformerState.performerId))
            .where(
              and(eq(profilePerformerState.profileId, profile), sql`${profilePerformerState.followedAt} is not null`),
            )
        ).map((row) => [row.id, row]),
      );

      // For each studio on the page, the nearest followed studio at or above
      // it. The depth guard stops a parent loop someone made by hand.
      const studioIds = [...new Set(pageRows.map((row) => row.studioId).filter((id): id is number => id !== null))];
      const followedStudioFor = new Map<number, { id: number; name: string }>();
      if (studioIds.length > 0) {
        const found = await db.execute<{ itemStudio: number; id: number; name: string }>(sql`
          with recursive up(item_studio, id, parent_id, depth) as (
            select s.id, s.id, s.parent_id, 0 from studios s
            where s.id in (${sql.join(studioIds.map((id) => sql`${id}`), sql`, `)})
            union all
            select up.item_studio, p.id, p.parent_id, up.depth + 1
            from up join studios p on p.id = up.parent_id
            where up.depth < 20
          )
          select distinct on (up.item_studio) up.item_studio as "itemStudio", s.id, s.name
          from up
          join profile_studio_state pss
            on pss.studio_id = up.id and pss.profile_id = ${profile} and pss.followed_at is not null
          join studios s on s.id = up.id
          order by up.item_studio, up.depth
        `);
        for (const row of found.rows) followedStudioFor.set(row.itemStudio, { id: row.id, name: row.name });
      }

      return {
        items: pageRows.map((row) => {
          const item = withPlayback(row, related);
          return {
            ...item,
            because: {
              performers: item.performers.flatMap(({ id, name }) => {
                const followed = followedPerformers.get(id);
                return followed
                  ? [{ id, name, hasImage: followed.hasImage, hasBanner: followed.hasBanner }]
                  : [];
              }),
              studio: row.studioId === null ? null : (followedStudioFor.get(row.studioId) ?? null),
            },
          };
        }),
        page,
        hasMore,
      };
    },
  );

  /**
   * The tags most used across what arrived recently from who this profile
   * follows, for the feed's sidebar. When nothing arrived in that window the
   * same count runs over all their videos instead, so the list says what
   * they make rather than going blank — `recent` tells the page which.
   */
  app.get("/api/following/tags", async (request) => {
    const profile = profileId(request);
    const count = async (recentOnly: boolean) =>
      (
        await db.execute<{ id: number; name: string; count: number }>(sql`
          select t.id, t.name, count(*)::int as count
          from media_items mi
          join media_item_tags mit on mit.media_item_id = mi.id
          join tags t on t.id = mit.tag_id
          where ${visibleItemsSql("mi", profile)}
            and mi.item_type_id in (select id from media_item_types where name = 'video')
            and ${itemFromFollowed(profile, sql`mi.id`, sql`mi.studio_id`)}
            ${recentOnly ? sql`and mi.created_at >= now() - make_interval(days => ${FOLLOWING_TRENDING_DAYS})` : sql``}
          group by t.id
          order by count desc, lower(t.name)
          limit ${FOLLOWING_TRENDING_LIMIT}
        `)
      ).rows;
    const recent = await count(true);
    if (recent.length > 0) return { tags: recent, recent: true, days: FOLLOWING_TRENDING_DAYS };
    return { tags: await count(false), recent: false, days: FOLLOWING_TRENDING_DAYS };
  });

  /**
   * Videos from who this profile follows still waiting in the inbox — what
   * the feed will have once they are approved. The newest few, and how many
   * there are in all. Vault items stay out, as they do from the inbox.
   */
  app.get("/api/following/upcoming", async (request) => {
    const profile = profileId(request);
    const where = and(
      reachableItems(profile),
      awaitingApproval(),
      itemFromFollowed(profile, mediaItems.id, mediaItems.studioId),
    );
    const items = await db
      .select({
        id: mediaItems.id,
        title: mediaItems.title,
        thumbnailFile: mediaItems.thumbnailFile,
        createdAt: mediaItems.createdAt,
      })
      .from(mediaItems)
      .where(where)
      .orderBy(desc(mediaItems.createdAt), desc(mediaItems.id))
      .limit(UPCOMING_LIMIT);
    const [counted] = await db.select({ count: sql<number>`count(*)::int` }).from(mediaItems).where(where);
    return { items, count: counted?.count ?? 0 };
  });

  /**
   * Unwatched videos from who this profile follows that reached the library
   * in the last week, for the notification bell. `newestAt` changes when a
   * new one arrives, which is what brings a dismissed notification back.
   */
  app.get("/api/following/summary", async (request) => {
    const profile = profileId(request);
    const [row] = await db
      .select({
        newCount: sql<number>`count(*)::int`,
        newestAt: sql<string | null>`max(${mediaItems.createdAt})`,
      })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
      .leftJoin(playbackStates, playbackJoin(profile))
      .where(
        and(
          visibleItems(profile),
          eq(mediaItemTypes.name, "video"),
          itemFromFollowed(profile, mediaItems.id, mediaItems.studioId),
          sql`${mediaItems.createdAt} >= now() - make_interval(days => ${FOLLOWING_NEW_DAYS})`,
          sql`${playbackStates.completedAt} is null`,
        ),
      );
    return { newCount: row?.newCount ?? 0, newestAt: row?.newestAt ?? null, days: FOLLOWING_NEW_DAYS };
  });
}
