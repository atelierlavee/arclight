// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { hiddenGate, visibleItems } from "../library/visibility.js";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import {
  mediaItemPerformers,
  mediaItems,
  mediaItemTypes,
  performers,
  playbackStates,
  series,
  studios,
} from "../db/schema.js";

import { profileId } from "../auth/profileContext.js";
import { logActivity } from "../activity/log.js";
import { playbackJoin } from "./mediaItemQueries.js";
import { suggestSeries } from "../library/seriesSuggestions.js";
import { serialized } from "../auth/serialize.js";
import { streamFile } from "../media/streamer.js";
import { deleteSeriesCover, saveSeriesCover, seriesCoverPath } from "../media/seriesCovers.js";
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
      await logActivity("metadata", `Story "${created.name}" created`, { seriesId: created.id });
      reply.code(201);
      return created;
    }
    const [existing] = await db
      .select()
      .from(series)
      .where(and(eq(series.libraryId, item.libraryId), eq(series.name, name)));
    return existing;
  });

  app.get<{ Querystring: { performer?: string } }>("/api/series", async (request) => {
    const profile = profileId(request);
    // ?performer=<id>: only series with that performer in an episode — for
    // the performer's own page.
    const performerId = Number(request.query.performer);
    const performerFilter =
      Number.isInteger(performerId) && performerId > 0
        ? inArray(
            series.id,
            db
              .selectDistinct({ id: mediaItems.seriesId })
              .from(mediaItems)
              .innerJoin(mediaItemPerformers, eq(mediaItemPerformers.mediaItemId, mediaItems.id))
              .where(and(eq(mediaItemPerformers.performerId, performerId), isNotNull(mediaItems.seriesId), visibleItems(profile))),
          )
        : undefined;
    const videoType = db
      .select({ id: mediaItemTypes.id })
      .from(mediaItemTypes)
      .where(eq(mediaItemTypes.name, "video"));
    const rows = await db
      .select({
        id: series.id,
        name: series.name,
        coverFile: series.coverFile,
        representativeItemId: sql<number | null>`min(${mediaItems.id})`,
        // The first three episodes, in order, for the list's stacked cover.
        coverItemIds: sql<number[]>`coalesce((array_agg(${mediaItems.id} order by ${mediaItems.seasonNumber} nulls first, ${mediaItems.episodeNumber} nulls first, ${mediaItems.id}) filter (where ${mediaItems.id} is not null))[1:3], '{}')`,
        episodeCount: count(mediaItems.id),
        unwatched: sql<number>`count(${mediaItems.id}) filter (where ${playbackStates.completedAt} is null)`,
        studios: sql<string[]>`coalesce(array_agg(distinct ${studios.name}) filter (where ${studios.name} is not null), '{}')`,
        firstReleased: sql<string | null>`min(${mediaItems.releaseDate})`,
        lastReleased: sql<string | null>`max(${mediaItems.releaseDate})`,
        // When this profile last played any episode, and when the newest
        // episode joined the library — for sorting, "Continue" and "New".
        lastPlayedAt: sql<string | null>`max(case when ${playbackStates.positionSeconds} > 0 or ${playbackStates.completedAt} is not null then ${playbackStates.updatedAt} end)`,
        newestAddedAt: sql<string | null>`max(${mediaItems.createdAt})`,
        // Each episode's place, in order: for the progress line, Continue,
        // and playing the next one straight from the list.
        episodes: sql<{ id: number; position: number; duration: number | null; completed: boolean }[]>`coalesce(json_agg(json_build_object(
          'id', ${mediaItems.id},
          'position', coalesce(${playbackStates.positionSeconds}, 0),
          'duration', ${mediaItems.durationSeconds},
          'completed', ${playbackStates.completedAt} is not null
        ) order by ${mediaItems.seasonNumber} nulls first, ${mediaItems.episodeNumber} nulls first, ${mediaItems.id}) filter (where ${mediaItems.id} is not null), '[]')`,
      })
      .from(series)
      .leftJoin(mediaItems, and(eq(mediaItems.seriesId, series.id), visibleItems(profile), eq(mediaItems.itemTypeId, videoType)))
      .leftJoin(playbackStates, playbackJoin(profile))
      .leftJoin(studios, eq(studios.id, mediaItems.studioId))
      .where(performerFilter)
      .groupBy(series.id)
      .orderBy(series.name);

    // Each series' lead: whoever appears in the most of its episodes.
    const seriesIds = rows.map((row) => row.id);
    const castCounts = seriesIds.length
      ? await db
          .select({
            seriesId: mediaItems.seriesId,
            id: performers.id,
            name: performers.name,
            parts: sql<number>`count(distinct ${mediaItems.id})::int`,
          })
          .from(mediaItemPerformers)
          .innerJoin(mediaItems, eq(mediaItems.id, mediaItemPerformers.mediaItemId))
          .innerJoin(performers, eq(performers.id, mediaItemPerformers.performerId))
          .where(and(inArray(mediaItems.seriesId, seriesIds), visibleItems(profile)))
          .groupBy(mediaItems.seriesId, performers.id)
          .orderBy(desc(sql`count(distinct ${mediaItems.id})`), asc(performers.name))
      : [];
    const lead = new Map<number, { id: number; name: string }>();
    for (const row of castCounts) {
      if (row.seriesId != null && !lead.has(row.seriesId)) lead.set(row.seriesId, { id: row.id, name: row.name });
    }
    return { series: rows.map((row) => ({ ...row, lead: lead.get(row.id) ?? null })) };
  });

  /** A series' uploaded cover; the filename in the URL makes it cacheable for good. */
  app.get<{ Params: { id: string } }>("/api/series/:id/cover", async (request, reply) => {
    const [entity] = await db.select({ coverFile: series.coverFile }).from(series).where(eq(series.id, Number(request.params.id)));
    if (!entity?.coverFile) {
      reply.code(404);
      return { error: "No cover" };
    }
    reply.header("Cache-Control", "private, max-age=31536000, immutable");
    await streamFile(reply, seriesCoverPath(entity.coverFile), "image/jpeg", undefined, false);
  });

  /** Sets a series' cover from an uploaded image. Owner only (see ownerRoutes). */
  app.post<{ Params: { id: string } }>("/api/series/:id/cover", async (request, reply) =>
    serialized(`series-cover:${request.params.id}`, async () => {
      const id = Number(request.params.id);
      const [entity] = await db.select().from(series).where(eq(series.id, id));
      if (!entity) {
        reply.code(404);
        return { error: "Series not found" };
      }
      const upload = await request.file();
      if (!upload) {
        reply.code(400);
        return { error: "No file uploaded" };
      }
      let buffer: Buffer;
      try {
        buffer = await upload.toBuffer();
      } catch {
        reply.code(413);
        return { error: "Image is too large" };
      }
      let fileName: string;
      try {
        fileName = await saveSeriesCover(buffer, id);
      } catch {
        reply.code(400);
        return { error: "That file could not be read as an image" };
      }
      await db.update(series).set({ coverFile: fileName, updatedAt: new Date() }).where(eq(series.id, id));
      // Only once the row points at the new file.
      await deleteSeriesCover(entity.coverFile);
      await logActivity("metadata", `Story "${entity.name}": cover uploaded`, { seriesId: id });
      return { ok: true, coverFile: fileName };
    }),
  );

  /** Removes a series' cover; the stack shows its episodes alone again. Owner only. */
  app.delete<{ Params: { id: string } }>("/api/series/:id/cover", async (request, reply) =>
    serialized(`series-cover:${request.params.id}`, async () => {
      const id = Number(request.params.id);
      const [entity] = await db.select().from(series).where(eq(series.id, id));
      if (!entity) {
        reply.code(404);
        return { error: "Series not found" };
      }
      await db.update(series).set({ coverFile: null, updatedAt: new Date() }).where(eq(series.id, id));
      await deleteSeriesCover(entity.coverFile);
      if (entity.coverFile) {
        await logActivity("metadata", `Story "${entity.name}": cover removed`, { seriesId: id });
      }
      return { ok: true };
    }),
  );

  /**
   * Likely series not yet made: videos outside any series, from one studio,
   * whose titles differ only by a part number ("LANA Part 1", "LANA Part 4").
   * Offered to the owner to create in one go; nothing is made here.
   */
  app.get("/api/series/suggestions", async (request) => {
    const profile = profileId(request);
    const videoType = db
      .select({ id: mediaItemTypes.id })
      .from(mediaItemTypes)
      .where(eq(mediaItemTypes.name, "video"));
    const candidates = await db
      .select({ id: mediaItems.id, title: mediaItems.title, studio: studios.name })
      .from(mediaItems)
      .leftJoin(studios, eq(studios.id, mediaItems.studioId))
      .where(and(isNull(mediaItems.seriesId), visibleItems(profile), eq(mediaItems.itemTypeId, videoType)));
    return { suggestions: suggestSeries(candidates) };
  });

  app.get<{ Params: { id: string } }>("/api/series/:id", async (request, reply) => {
    const profile = profileId(request);
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
        // When this profile last played it — for "last watched" on the page.
        lastPlayedAt: sql<string | null>`case when ${playbackStates.positionSeconds} > 0 or ${playbackStates.completedAt} is not null then ${playbackStates.updatedAt} end`,
        releaseDate: mediaItems.releaseDate,
        description: mediaItems.description,
        studio: studios.name,
      })
      .from(mediaItems)
      .leftJoin(playbackStates, playbackJoin(profile))
      .leftJoin(studios, eq(studios.id, mediaItems.studioId))
      .where(and(eq(mediaItems.seriesId, id), visibleItems(profile)))
      .orderBy(asc(mediaItems.seasonNumber), asc(mediaItems.episodeNumber), desc(mediaItems.createdAt));

    // Who is in the series, across its parts: most-appearing first.
    const ids = episodes.map((episode) => episode.id);
    const cast = ids.length
      ? await db
          .select({ id: performers.id, name: performers.name, parts: sql<number>`count(distinct ${mediaItemPerformers.mediaItemId})::int` })
          .from(mediaItemPerformers)
          .innerJoin(performers, eq(performers.id, mediaItemPerformers.performerId))
          .where(inArray(mediaItemPerformers.mediaItemId, ids))
          .groupBy(performers.id)
          .orderBy(desc(sql`count(distinct ${mediaItemPerformers.mediaItemId})`), asc(performers.name))
      : [];
    // And who is in each part, since it can differ from one to the next.
    const castRows = ids.length
      ? await db
          .select({ mediaItemId: mediaItemPerformers.mediaItemId, id: performers.id, name: performers.name })
          .from(mediaItemPerformers)
          .innerJoin(performers, eq(performers.id, mediaItemPerformers.performerId))
          .where(inArray(mediaItemPerformers.mediaItemId, ids))
          .orderBy(asc(performers.name))
      : [];
    const castByItem = new Map<number, { id: number; name: string }[]>();
    for (const row of castRows) {
      const list = castByItem.get(row.mediaItemId) ?? [];
      list.push({ id: row.id, name: row.name });
      castByItem.set(row.mediaItemId, list);
    }
    const dates = episodes.map((episode) => episode.releaseDate).filter((date): date is string => Boolean(date)).sort();
    const studioNames = [...new Set(episodes.map((episode) => episode.studio).filter((name): name is string => Boolean(name)))];

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
      coverFile: entity.coverFile,
      // The first part's synopsis stands for the series.
      description: episodes.find((episode) => episode.description)?.description ?? null,
      studios: studioNames,
      firstReleased: dates[0] ?? null,
      lastReleased: dates[dates.length - 1] ?? null,
      performers: cast,
      seasons: [...seasons.entries()].map(([number, seasonEpisodes]) => ({
        number,
        // Each part keeps its own synopsis, shown on its row.
        episodes: seasonEpisodes.map(({ studio: _studio, ...episode }) => ({
          ...episode,
          performers: castByItem.get(episode.id) ?? [],
        })),
      })),
    };
  });

  /**
   * Other series worth a look from this one: those sharing its performers
   * first, then its studio. Only what this profile may see counts.
   */
  app.get<{ Params: { id: string } }>("/api/series/:id/related", async (request) => {
    const profile = profileId(request);
    const id = Number(request.params.id);
    const mine = db.select({ id: mediaItems.id }).from(mediaItems).where(eq(mediaItems.seriesId, id));
    const myPerformers = db
      .selectDistinct({ id: mediaItemPerformers.performerId })
      .from(mediaItemPerformers)
      .where(inArray(mediaItemPerformers.mediaItemId, mine));
    const myStudios = db
      .selectDistinct({ id: mediaItems.studioId })
      .from(mediaItems)
      .where(and(eq(mediaItems.seriesId, id), isNotNull(mediaItems.studioId)));
    const shared = sql<number>`(count(distinct ${mediaItemPerformers.performerId}) filter (where ${inArray(mediaItemPerformers.performerId, myPerformers)}))::int`;
    const sameStudio = sql<boolean>`coalesce(bool_or(${inArray(mediaItems.studioId, myStudios)}), false)`;

    const rows = await db
      .select({
        id: series.id,
        name: series.name,
        representativeItemId: sql<number | null>`min(${mediaItems.id})`,
        episodeCount: sql<number>`count(distinct ${mediaItems.id})::int`,
        sharedPerformers: shared,
        sameStudio,
      })
      .from(series)
      .innerJoin(mediaItems, and(eq(mediaItems.seriesId, series.id), visibleItems(profile)))
      .leftJoin(mediaItemPerformers, eq(mediaItemPerformers.mediaItemId, mediaItems.id))
      .where(ne(series.id, id))
      .groupBy(series.id)
      .having(sql`${shared} > 0 or ${sameStudio}`)
      .orderBy(desc(shared), desc(sameStudio), asc(series.name))
      .limit(12);
    return { series: rows };
  });
}
