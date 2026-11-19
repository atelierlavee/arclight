import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { mediaItemTypes, mediaItems, performers, playbackStates, studios } from "../db/schema.js";
import { profileId } from "../auth/profileContext.js";
import { itemFromFollowed, setPerformerFollowed, setStudioFollowed } from "../library/following.js";
import { visibleItems } from "../library/visibility.js";
import { parseId, playbackJoin } from "./mediaItemQueries.js";

/** How far back "new from who you follow" looks, in days. */
export const FOLLOWING_NEW_DAYS = 7;

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
