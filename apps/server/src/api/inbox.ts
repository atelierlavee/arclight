// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { and, eq, inArray, isNull, sql, desc } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import {
  mediaItems,
  mediaItemPerformers,
  mediaItemTags,
  mediaItemTypes,
  performers,
  playbackStates,
  studios,
  tags,
} from "../db/schema.js";
import { reachableItems } from "../library/visibility.js";
import { isId, parsePage } from "./mediaItemQueries.js";

import { profileId } from "../auth/profileContext.js";
import { itemIsFavorite, itemRating } from "../library/profileState.js";
/** Waiting videos per page of the inbox. */
const INBOX_PAGE_SIZE = 50;

/** Most ids one triage request acts on. */
const MAX_TRIAGE = 500;

export async function inboxRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/inbox/count", async (request) => {
    const profile = profileId(request);
    const videoTypeIds = db
      .select({ id: mediaItemTypes.id })
      .from(mediaItemTypes)
      .where(eq(mediaItemTypes.name, "video"));

    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mediaItems)
      .where(
        and(reachableItems(profile), inArray(mediaItems.itemTypeId, videoTypeIds), isNull(mediaItems.triagedAt)),
      );
    return { count: row?.count ?? 0 };
  });

  /**
   * Which page of the inbox a waiting video is on, so a link to one video
   * can open the inbox right at it. Counted in the list's own order (newest
   * first) and page size. 404 when it isn't waiting — approved since, gone,
   * or in this profile's vault.
   */
  app.get<{ Querystring: { id?: string } }>("/api/inbox/locate", async (request, reply) => {
    const profile = profileId(request);
    const id = Number(request.query.id);
    if (!isId(id)) {
      reply.code(400);
      return { error: "id must be a positive whole number" };
    }
    const videoTypeIds = db
      .select({ id: mediaItemTypes.id })
      .from(mediaItemTypes)
      .where(eq(mediaItemTypes.name, "video"));
    const waiting = and(
      reachableItems(profile),
      inArray(mediaItems.itemTypeId, videoTypeIds),
      isNull(mediaItems.triagedAt),
    );
    const [target] = await db
      .select({ createdAt: mediaItems.createdAt })
      .from(mediaItems)
      .where(and(waiting, eq(mediaItems.id, id)));
    if (!target) {
      reply.code(404);
      return { error: "Not waiting in the inbox" };
    }
    const [ahead] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mediaItems)
      .where(
        and(
          waiting,
          sql`(${mediaItems.createdAt}, ${mediaItems.id}) > (${target.createdAt}, ${id})`,
        ),
      );
    return { page: Math.floor((ahead?.count ?? 0) / INBOX_PAGE_SIZE) + 1 };
  });

  app.get<{ Querystring: { page?: string } }>("/api/inbox", async (request, reply) => {
    const profile = profileId(request);
    const page = parsePage(request.query.page);
    if (page === null) {
      reply.code(400);
      return { error: "page must be a positive whole number" };
    }
    const pageSize = INBOX_PAGE_SIZE;

    const videoTypeIds = db
      .select({ id: mediaItemTypes.id })
      .from(mediaItemTypes)
      .where(eq(mediaItemTypes.name, "video"));

    const items = await db
      .select({
        id: mediaItems.id,
        title: mediaItems.title,
        description: mediaItems.description,
        thumbnailFile: mediaItems.thumbnailFile,
        thumbnailPositionX: mediaItems.thumbnailPositionX,
        thumbnailPositionY: mediaItems.thumbnailPositionY,
        thumbnailScale: mediaItems.thumbnailScale,
        durationSeconds: mediaItems.durationSeconds,
        releaseDate: mediaItems.releaseDate,
        // The file as named on disk, so the page can suggest a better name.
        // An item can have more than one file; the first is the one shown.
        fileName: sql<string | null>`(
          select regexp_replace(mf.path, '^.*/', '')
          from media_files mf
          where mf.media_item_id = ${mediaItems.id}
          order by mf.id
          limit 1
        )`,
        itemType: sql<string>`'video'`,
        studioId: mediaItems.studioId,
        studioName: studios.name,
        rating: itemRating(profile, mediaItems.id),
        isFavorite: itemIsFavorite(profile, mediaItems.id),
        createdAt: mediaItems.createdAt,
      })
      .from(mediaItems)
      .leftJoin(studios, eq(studios.id, mediaItems.studioId))
      .where(
        and(reachableItems(profile), inArray(mediaItems.itemTypeId, videoTypeIds), isNull(mediaItems.triagedAt)),
      )
      .orderBy(desc(mediaItems.createdAt), desc(mediaItems.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const itemIds = items.map((i) => i.id);
    const itemPerformers =
      itemIds.length === 0
        ? []
        : await db
            .select({
              mediaItemId: mediaItemPerformers.mediaItemId,
              performerId: performers.id,
              performerName: performers.name,
            })
            .from(mediaItemPerformers)
            .innerJoin(performers, eq(performers.id, mediaItemPerformers.performerId))
            .where(inArray(mediaItemPerformers.mediaItemId, itemIds));

    const itemTags =
      itemIds.length === 0
        ? []
        : await db
            .select({
              mediaItemId: mediaItemTags.mediaItemId,
              tagId: tags.id,
              tagName: tags.name,
            })
            .from(mediaItemTags)
            .innerJoin(tags, eq(tags.id, mediaItemTags.tagId))
            .where(inArray(mediaItemTags.mediaItemId, itemIds));

    const enriched = items.map((item) => ({
      ...item,
      performers: itemPerformers
        .filter((p) => p.mediaItemId === item.id)
        .map((p) => ({ id: p.performerId, name: p.performerName })),
      tags: itemTags
        .filter((t) => t.mediaItemId === item.id)
        .map((t) => ({ id: t.tagId, name: t.tagName })),
    }));

    return { items: enriched, page, pageSize, hasMore: items.length === pageSize };
  });

  app.post<{ Body: { ids: number[] } }>("/api/inbox/triage", async (request, reply) => {
    const ids = (request.body as { ids?: unknown } | undefined)?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      reply.code(400);
      return { error: "ids must be a non-empty array" };
    }
    if (!ids.every(isId)) {
      reply.code(400);
      return { error: "ids must be positive whole numbers" };
    }

    // Anything past the cap is left for the next request rather than
    // rejected; the count says how many were actually handled.
    const batch = [...new Set(ids)].slice(0, MAX_TRIAGE);
    await db
      .update(mediaItems)
      .set({ triagedAt: new Date() })
      .where(inArray(mediaItems.id, batch));

    return { ok: true, count: batch.length };
  });

  app.post("/api/inbox/triage-all", async (request) => {
    const profile = profileId(request);
    const videoTypeIds = db
      .select({ id: mediaItemTypes.id })
      .from(mediaItemTypes)
      .where(eq(mediaItemTypes.name, "video"));

    const result = await db
      .update(mediaItems)
      .set({ triagedAt: new Date() })
      .where(
        and(reachableItems(profile), inArray(mediaItems.itemTypeId, videoTypeIds), isNull(mediaItems.triagedAt)),
      )
      .returning({ id: mediaItems.id });

    return { ok: true, count: result.length };
  });
}
