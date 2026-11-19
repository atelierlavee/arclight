import { and, eq, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { db } from "../db/client.js";
import { profilePerformerState, profileStudioState } from "../db/schema.js";

/**
 * Following: a profile marks performers and studios whose new videos it
 * wants to hear about. Per profile, like favourites — what one person
 * follows is nobody else's business.
 */

/**
 * True when the item features a performer this profile follows, or comes
 * from a studio it follows — including any site under a followed network,
 * however deep.
 */
export function itemFromFollowed(profileId: number, item: SQLWrapper, studioId: SQLWrapper): SQL {
  return sql`(
    exists (
      select 1 from media_item_performers mip
      join profile_performer_state pps
        on pps.performer_id = mip.performer_id
       and pps.profile_id = ${profileId}
       and pps.followed_at is not null
      where mip.media_item_id = ${item}
    )
    or ${studioId} in (
      with recursive under(id) as (
        select pss.studio_id from profile_studio_state pss
        where pss.profile_id = ${profileId} and pss.followed_at is not null
        union
        select c.id from studios c join under u on c.parent_id = u.id
      )
      select id from under
    )
  )`;
}

export async function setPerformerFollowed(profileId: number, performerId: number, followed: boolean) {
  const followedAt = followed ? new Date() : null;
  await db
    .insert(profilePerformerState)
    .values({ profileId, performerId, followedAt })
    .onConflictDoUpdate({
      target: [profilePerformerState.profileId, profilePerformerState.performerId],
      set: { followedAt },
    });
  return followedAt;
}

export async function setStudioFollowed(profileId: number, studioId: number, followed: boolean) {
  const followedAt = followed ? new Date() : null;
  await db
    .insert(profileStudioState)
    .values({ profileId, studioId, followedAt })
    .onConflictDoUpdate({
      target: [profileStudioState.profileId, profileStudioState.studioId],
      set: { followedAt },
    });
  return followedAt;
}

export async function studioFollowedAt(profileId: number, studioId: number): Promise<Date | null> {
  const [row] = await db
    .select({ followedAt: profileStudioState.followedAt })
    .from(profileStudioState)
    .where(and(eq(profileStudioState.profileId, profileId), eq(profileStudioState.studioId, studioId)));
  return row?.followedAt ?? null;
}
