import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { hiddenGate, visibleItems } from "../library/visibility.js";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { mediaItems, mediaItemTypes, playbackStates, series } from "../db/schema.js";

export async function seriesRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { name: string; mediaItemId: number } }>("/api/series", async (request, reply) => {
    const name = request.body.name?.trim();
    if (!name || !Number.isInteger(request.body.mediaItemId)) {
      reply.code(400);
      return { error: "name and mediaItemId are required" };
    }
    const [item] = await db
      .select({ libraryId: mediaItems.libraryId })
      .from(mediaItems)
      // Same 404 as a missing id for a vault item this session can't open.
      .where(and(eq(mediaItems.id, request.body.mediaItemId), hiddenGate(request)));
    if (!item) {
      reply.code(404);
      return { error: "Media item not found" };
    }
    const [created] = await db
      .insert(series)
      .values({ libraryId: item.libraryId, name, nameSource: "user" })
      .onConflictDoNothing()
      .returning();
    if (created) {
      reply.code(201);
      return created;
    }
    const [existing] = await db
      .select()
      .from(series)
      .where(and(eq(series.libraryId, item.libraryId), eq(series.name, name)));
    return existing;
  });

  app.get("/api/series", async () => {
    const videoType = db
      .select({ id: mediaItemTypes.id })
      .from(mediaItemTypes)
      .where(eq(mediaItemTypes.name, "video"));
    const rows = await db
      .select({
        id: series.id,
        name: series.name,
        representativeItemId: sql<number | null>`min(${mediaItems.id})`,
        episodeCount: count(mediaItems.id),
        unwatched: sql<number>`count(*) filter (where ${playbackStates.completedAt} is null)`,
      })
      .from(series)
      .leftJoin(mediaItems, and(eq(mediaItems.seriesId, series.id), visibleItems(), eq(mediaItems.itemTypeId, videoType)))
      .leftJoin(playbackStates, eq(playbackStates.mediaItemId, mediaItems.id))
      .groupBy(series.id)
      .orderBy(series.name);
    return { series: rows };
  });

  app.get<{ Params: { id: string } }>("/api/series/:id", async (request, reply) => {
    const id = Number(request.params.id);
    const [entity] = await db.select().from(series).where(eq(series.id, id));
    if (!entity) {
      reply.code(404);
      return { error: "Series not found" };
    }

    const episodes = await db
      .select({
        id: mediaItems.id,
        title: mediaItems.title,
        episodeTitle: mediaItems.episodeTitle,
        seasonNumber: mediaItems.seasonNumber,
        episodeNumber: mediaItems.episodeNumber,
        durationSeconds: mediaItems.durationSeconds,
        thumbnailFile: mediaItems.thumbnailFile,
        completedAt: playbackStates.completedAt,
        lastPositionSeconds: playbackStates.positionSeconds,
      })
      .from(mediaItems)
      .leftJoin(playbackStates, eq(playbackStates.mediaItemId, mediaItems.id))
      .where(and(eq(mediaItems.seriesId, id), visibleItems()))
      .orderBy(asc(mediaItems.seasonNumber), asc(mediaItems.episodeNumber), desc(mediaItems.createdAt));

    const seasons = new Map<number, typeof episodes>();
    for (const episode of episodes) {
      const season = episode.seasonNumber ?? 1;
      const current = seasons.get(season) ?? [];
      current.push(episode);
      seasons.set(season, current);
    }

    return {
      id: entity.id,
      name: entity.name,
      seasons: [...seasons.entries()].map(([number, seasonEpisodes]) => ({ number, episodes: seasonEpisodes })),
    };
  });
}
