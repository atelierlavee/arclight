// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { mediaItemMarkers, mediaItems, studios } from "../db/schema.js";
import { itemReachable } from "../library/visibility.js";
import {
  fetchTpdbMarkers,
  getTpdbKey,
  searchTpdbScenes,
  type TpdbMarker,
} from "../metadata/tpdb.js";

const MAX_TITLE_LENGTH = 100;
/** Far past any real scene; a ceiling so a bad source cannot flood the seek bar. */
const MAX_MARKERS_PER_ITEM = 200;

const columns = {
  id: mediaItemMarkers.id,
  mediaItemId: mediaItemMarkers.mediaItemId,
  title: mediaItemMarkers.title,
  startSeconds: mediaItemMarkers.startSeconds,
  endSeconds: mediaItemMarkers.endSeconds,
};

/**
 * Markers fitted to the video: past-the-end ones dropped, ends clamped, and
 * an end at or before its start treated as no end at all.
 */
export function fitMarkers(markers: TpdbMarker[], durationSeconds: number | null): TpdbMarker[] {
  return markers
    .filter((m) => durationSeconds == null || m.startSeconds < durationSeconds)
    .map((m) => {
      let end = m.endSeconds;
      if (end != null && durationSeconds != null) end = Math.min(end, durationSeconds);
      if (end != null && end <= m.startSeconds) end = null;
      return { title: m.title.slice(0, MAX_TITLE_LENGTH), startSeconds: m.startSeconds, endSeconds: end };
    })
    .slice(0, MAX_MARKERS_PER_ITEM);
}

/** Videos being looked up right now, so two opens at once ask only once. */
const inFlight = new Map<number, Promise<void>>();

/**
 * Looks a video up on ThePornDB once and stores what it finds.
 *
 * Only a sure match is taken — one scene from the video's studio (or its
 * network) released the same day — and the video is marked checked whether
 * or not one was found, so it is never asked about again. A failed request (offline, an
 * outage) leaves it unchecked for the next open.
 */
async function lookUpOnce(itemId: number, apiKey: string): Promise<void> {
  const [item] = await db
    .select({
      title: mediaItems.title,
      date: mediaItems.releaseDate,
      durationSeconds: mediaItems.durationSeconds,
      checkedAt: mediaItems.tpdbCheckedAt,
      studio: studios.name,
    })
    .from(mediaItems)
    .leftJoin(studios, eq(studios.id, mediaItems.studioId))
    .where(eq(mediaItems.id, itemId));
  // Without a studio and a release date there is no sure match to find, and
  // it is left unchecked so a later StashDB sync that fills them in counts.
  if (!item || item.checkedAt || !item.studio || !item.date) return;

  let sceneId: string | null;
  let markers: TpdbMarker[] = [];
  try {
    sceneId = (await searchTpdbScenes(apiKey, item)).confidentId;
    if (sceneId) markers = fitMarkers(await fetchTpdbMarkers(apiKey, sceneId), item.durationSeconds);
  } catch {
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(mediaItemMarkers).where(eq(mediaItemMarkers.mediaItemId, itemId));
    if (markers.length > 0) {
      await tx.insert(mediaItemMarkers).values(markers.map((m) => ({ ...m, mediaItemId: itemId })));
    }
    await tx
      .update(mediaItems)
      .set({ tpdbSceneId: sceneId, tpdbCheckedAt: new Date() })
      .where(eq(mediaItems.id, itemId));
  });
}

/**
 * The named positions in a video, drawn along the seek bar. Fetched from
 * ThePornDB the first time the video is opened, when TPDB_API_KEY is set.
 */
export async function markerRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/api/media-items/:id/markers", async (request, reply) => {
    const id = Number(request.params.id);
    // Named positions in a vault item say as much as the item does.
    if (!(await itemReachable(request, id))) {
      reply.code(404);
      return { error: "Not found" };
    }

    const apiKey = getTpdbKey();
    if (apiKey) {
      let lookup = inFlight.get(id);
      if (!lookup) {
        lookup = lookUpOnce(id, apiKey).finally(() => inFlight.delete(id));
        inFlight.set(id, lookup);
      }
      await lookup;
    }

    const markers = await db
      .select(columns)
      .from(mediaItemMarkers)
      .where(eq(mediaItemMarkers.mediaItemId, id))
      .orderBy(asc(mediaItemMarkers.startSeconds), asc(mediaItemMarkers.id))
      .limit(MAX_MARKERS_PER_ITEM);
    return { markers };
  });
}
