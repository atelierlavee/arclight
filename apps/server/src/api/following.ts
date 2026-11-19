import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { mediaItemTypes, mediaItems, performers, playbackStates, studios } from "../db/schema.js";
import { profileId } from "../auth/profileContext.js";
import { itemFromFollowed, setPerformerFollowed, setStudioFollowed } from "../library/following.js";
import { visibleItems, visibleItemsSql } from "../library/visibility.js";
import { parseId, playbackJoin } from "./mediaItemQueries.js";

/** How far back "new from who you follow" looks, in days. */
export const FOLLOWING_NEW_DAYS = 7;

/** "Most watched this month" looks back this far, in days. */
export const FOLLOWING_RECENT_DAYS = 30;

/** Followed but not watched for this long, in days, counts as gone quiet. */
export const FOLLOWING_QUIET_DAYS = 60;

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
