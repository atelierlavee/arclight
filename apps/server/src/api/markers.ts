import { and, asc, count, countDistinct, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { logActivity } from "../activity/log.js";
import { profileId } from "../auth/profileContext.js";
import { db } from "../db/client.js";
import { mediaItemMarkers, mediaItems, mediaItemTypes, studios } from "../db/schema.js";
import { hiddenGate, itemReachable, visibleItems } from "../library/visibility.js";
import {
  fetchTpdbMarkers,
  getTpdbKey,
  searchTpdbScenes,
  TpdbError,
  type TpdbMarker,
} from "../metadata/tpdb.js";

const MAX_TITLE_LENGTH = 100;
/** Far past any real scene; a ceiling so a bad source cannot flood the seek bar. */
const MAX_MARKERS_PER_ITEM = 200;
const PAGE_SIZE = 60;
/** Between ThePornDB requests in a library-wide fetch, to stay a polite client. */
const FETCH_ALL_GAP_MS = 1_000;

const NO_KEY = "Set TPDB_API_KEY on the server to use ThePornDB.";

const columns = {
  id: mediaItemMarkers.id,
  mediaItemId: mediaItemMarkers.mediaItemId,
  title: mediaItemMarkers.title,
  startSeconds: mediaItemMarkers.startSeconds,
  endSeconds: mediaItemMarkers.endSeconds,
  source: mediaItemMarkers.source,
};

/**
 * The key two spellings of one position share: "Standing Doggystyle" and
 * "Standing Doggy Style" are the same thing, and so are "Blowjob" and
 * "Blow Job". Mirrored by `markerKey` on the web side.
 */
const groupKey = sql<string>`regexp_replace(lower(${mediaItemMarkers.title}), '[^a-z0-9]', '', 'g')`;

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

/**
 * Replaces the item's ThePornDB markers with these. Hand-made markers are
 * left alone: a re-fetch should not undo the owner's own work.
 */
async function saveTpdbMarkers(itemId: number, sceneId: string, markers: TpdbMarker[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(mediaItemMarkers)
      .where(and(eq(mediaItemMarkers.mediaItemId, itemId), eq(mediaItemMarkers.source, "tpdb")));
    if (markers.length > 0) {
      await tx
        .insert(mediaItemMarkers)
        .values(markers.map((m) => ({ ...m, mediaItemId: itemId, source: "tpdb" })));
    }
    await tx
      .update(mediaItems)
      .set({ tpdbSceneId: sceneId, tpdbCheckedAt: new Date() })
      .where(eq(mediaItems.id, itemId));
  });
}

/** What a scene search is built from: the video's own studio, date and title. */
async function sceneQueryFor(itemId: number) {
  const [row] = await db
    .select({
      title: mediaItems.title,
      date: mediaItems.releaseDate,
      durationSeconds: mediaItems.durationSeconds,
      studio: studios.name,
    })
    .from(mediaItems)
    .leftJoin(studios, eq(studios.id, mediaItems.studioId))
    .where(eq(mediaItems.id, itemId));
  return row;
}

function sendTpdbError(reply: FastifyReply, err: unknown) {
  if (err instanceof TpdbError) {
    reply.code(err.status);
    return { error: err.message };
  }
  throw err;
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, MAX_TITLE_LENGTH);
  return trimmed || null;
}

function isSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// ── Library-wide fetch ──────────────────────────────────────────────────────

export type FetchAllStatus = {
  running: boolean;
  total: number;
  checked: number;
  matched: number;
  markers: number;
  failed: number;
  error: string | null;
  finishedAt: string | null;
};

let fetchAll: FetchAllStatus = {
  running: false,
  total: 0,
  checked: 0,
  matched: 0,
  markers: 0,
  failed: 0,
  error: null,
  finishedAt: null,
};

/** For tests: the last run's state, and a way to wait for one to finish. */
export function fetchAllStatus(): FetchAllStatus {
  return { ...fetchAll };
}
let fetchAllDone: Promise<void> = Promise.resolve();
export function fetchAllSettled(): Promise<void> {
  return fetchAllDone;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Every video the owner can see in the library, with a studio and a release
 * date, that has not been looked up yet. Without both there is no confident
 * match to take unattended; those are left for the per-video dialog, as are
 * videos in the owner's vault.
 */
async function videosToCheck(viewer: number): Promise<number[]> {
  const videoTypeIds = db
    .select({ id: mediaItemTypes.id })
    .from(mediaItemTypes)
    .where(eq(mediaItemTypes.name, "video"));
  const rows = await db
    .select({ id: mediaItems.id })
    .from(mediaItems)
    .where(
      and(
        inArray(mediaItems.itemTypeId, videoTypeIds),
        visibleItems(viewer),
        isNotNull(mediaItems.studioId),
        isNotNull(mediaItems.releaseDate),
        isNull(mediaItems.tpdbCheckedAt),
      ),
    )
    .orderBy(asc(mediaItems.id));
  return rows.map((row) => row.id);
}

async function runFetchAll(apiKey: string, ids: number[], gapMs: number): Promise<void> {
  for (const [index, id] of ids.entries()) {
    if (index > 0) await sleep(gapMs);
    try {
      const query = await sceneQueryFor(id);
      if (!query) continue;
      const { confidentId } = await searchTpdbScenes(apiKey, query);
      if (confidentId) {
        const markers = fitMarkers(await fetchTpdbMarkers(apiKey, confidentId), query.durationSeconds);
        await saveTpdbMarkers(id, confidentId, markers);
        fetchAll.matched += 1;
        fetchAll.markers += markers.length;
      } else {
        await db.update(mediaItems).set({ tpdbCheckedAt: new Date() }).where(eq(mediaItems.id, id));
      }
      fetchAll.checked += 1;
    } catch (err) {
      // A rejected key fails every request after it too, so stop there. Any
      // other failure leaves the video unchecked for the next run.
      if (err instanceof TpdbError && err.status === 400) {
        fetchAll.error = err.message;
        break;
      }
      fetchAll.failed += 1;
    }
  }
  fetchAll.running = false;
  fetchAll.finishedAt = new Date().toISOString();
  await logActivity(
    "metadata",
    `ThePornDB: checked ${fetchAll.checked} videos, ${fetchAll.matched} matched, ${fetchAll.markers} positions`,
    { ...fetchAll },
  );
}

/** Test hook: how long the library-wide fetch waits between videos. */
let gapMs = FETCH_ALL_GAP_MS;
export function setFetchAllGap(ms: number): void {
  gapMs = ms;
}

/**
 * Position markers on videos: the named stretches drawn along the seek bar,
 * fetched from ThePornDB or added by hand.
 */
export async function markerRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/api/media-items/:id/markers", async (request, reply) => {
    const id = Number(request.params.id);
    // Named positions in a vault item say as much as the item does.
    if (!(await itemReachable(request, id))) {
      reply.code(404);
      return { error: "Not found" };
    }
    const markers = await db
      .select(columns)
      .from(mediaItemMarkers)
      .where(eq(mediaItemMarkers.mediaItemId, id))
      .orderBy(asc(mediaItemMarkers.startSeconds), asc(mediaItemMarkers.id))
      .limit(MAX_MARKERS_PER_ITEM);
    const [item] = await db
      .select({ tpdbSceneId: mediaItems.tpdbSceneId, tpdbCheckedAt: mediaItems.tpdbCheckedAt })
      .from(mediaItems)
      .where(eq(mediaItems.id, id));
    return { markers, tpdbSceneId: item?.tpdbSceneId ?? null, tpdbCheckedAt: item?.tpdbCheckedAt ?? null };
  });

  app.get<{ Params: { id: string } }>("/api/tpdb/match/:id", async (request, reply) => {
    const id = Number(request.params.id);
    if (!(await itemReachable(request, id))) {
      reply.code(404);
      return { error: "Not found" };
    }
    const apiKey = getTpdbKey();
    if (!apiKey) {
      reply.code(400);
      return { error: NO_KEY };
    }
    const query = await sceneQueryFor(id);
    try {
      return { query, ...(await searchTpdbScenes(apiKey, query)) };
    } catch (err) {
      return sendTpdbError(reply, err);
    }
  });

  app.post<{ Params: { id: string }; Body: { sceneId?: unknown } }>(
    "/api/media-items/:id/tpdb-markers",
    async (request, reply) => {
      const id = Number(request.params.id);
      const sceneId = request.body?.sceneId;
      if (typeof sceneId !== "string" || !sceneId.trim() || sceneId.length > 100) {
        reply.code(400);
        return { error: "Choose a ThePornDB scene." };
      }
      if (!(await itemReachable(request, id))) {
        reply.code(404);
        return { error: "Not found" };
      }
      const apiKey = getTpdbKey();
      if (!apiKey) {
        reply.code(400);
        return { error: NO_KEY };
      }
      try {
        const query = await sceneQueryFor(id);
        const markers = fitMarkers(await fetchTpdbMarkers(apiKey, sceneId.trim()), query.durationSeconds);
        await saveTpdbMarkers(id, sceneId.trim(), markers);
        return { count: markers.length };
      } catch (err) {
        return sendTpdbError(reply, err);
      }
    },
  );

  app.post<{ Params: { id: string }; Body: { title?: unknown; startSeconds?: unknown; endSeconds?: unknown } }>(
    "/api/media-items/:id/markers",
    async (request, reply) => {
      const id = Number(request.params.id);
      const { title, startSeconds, endSeconds } = request.body ?? {};
      const name = cleanTitle(title);
      if (!name || !isSeconds(startSeconds) || (endSeconds != null && !isSeconds(endSeconds))) {
        reply.code(400);
        return { error: "A marker needs a name and a start time." };
      }
      const [item] = await db
        .select({ durationSeconds: mediaItems.durationSeconds })
        .from(mediaItems)
        .where(and(eq(mediaItems.id, id), hiddenGate(request)));
      if (!item) {
        reply.code(404);
        return { error: "Not found" };
      }
      const [fitted] = fitMarkers(
        [{ title: name, startSeconds: Math.floor(startSeconds), endSeconds: endSeconds == null ? null : Math.floor(endSeconds) }],
        item.durationSeconds,
      );
      if (!fitted) {
        reply.code(400);
        return { error: "That time is past the end of the video." };
      }
      const [created] = await db
        .insert(mediaItemMarkers)
        .values({ ...fitted, mediaItemId: id, source: "manual" })
        .returning(columns);
      reply.code(201);
      return created;
    },
  );

  /** The marker, if it exists and its video is reachable from this session. */
  async function reachableMarker(request: Parameters<typeof itemReachable>[0], id: number) {
    if (!Number.isInteger(id)) return null;
    const [row] = await db
      .select({ ...columns, durationSeconds: mediaItems.durationSeconds })
      .from(mediaItemMarkers)
      .innerJoin(mediaItems, eq(mediaItems.id, mediaItemMarkers.mediaItemId))
      .where(and(eq(mediaItemMarkers.id, id), hiddenGate(request)));
    return row ?? null;
  }

  app.patch<{ Params: { id: string }; Body: { title?: unknown; startSeconds?: unknown; endSeconds?: unknown } }>(
    "/api/markers/:id",
    async (request, reply) => {
      const marker = await reachableMarker(request, Number(request.params.id));
      if (!marker) {
        reply.code(404);
        return { error: "Not found" };
      }
      const body = request.body ?? {};
      const title = "title" in body ? cleanTitle(body.title) : marker.title;
      const start = "startSeconds" in body ? body.startSeconds : marker.startSeconds;
      const end = "endSeconds" in body ? body.endSeconds : marker.endSeconds;
      if (!title || !isSeconds(start) || (end != null && !isSeconds(end))) {
        reply.code(400);
        return { error: "A marker needs a name and a start time." };
      }
      const [fitted] = fitMarkers(
        [{ title, startSeconds: Math.floor(start), endSeconds: end == null ? null : Math.floor(end) }],
        marker.durationSeconds,
      );
      if (!fitted) {
        reply.code(400);
        return { error: "That time is past the end of the video." };
      }
      // An edited marker is the owner's now: a re-fetch must not overwrite it.
      const [updated] = await db
        .update(mediaItemMarkers)
        .set({ ...fitted, source: "manual" })
        .where(eq(mediaItemMarkers.id, marker.id))
        .returning(columns);
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>("/api/markers/:id", async (request, reply) => {
    const marker = await reachableMarker(request, Number(request.params.id));
    if (!marker) {
      reply.code(404);
      return { error: "Not found" };
    }
    await db.delete(mediaItemMarkers).where(eq(mediaItemMarkers.id, marker.id));
    return { ok: true };
  });

  /** Each position name in the library, spellings merged, most common first. */
  app.get("/api/markers/names", async (request) => {
    const rows = await db
      .select({
        key: groupKey,
        // The spelling used most often stands for the group.
        name: sql<string>`mode() within group (order by ${mediaItemMarkers.title})`,
        markers: count(),
        videos: countDistinct(mediaItemMarkers.mediaItemId),
      })
      .from(mediaItemMarkers)
      .innerJoin(mediaItems, eq(mediaItems.id, mediaItemMarkers.mediaItemId))
      .where(and(visibleItems(profileId(request)), sql`${groupKey} <> ''`))
      .groupBy(groupKey)
      .orderBy(desc(count()), asc(groupKey));
    return { names: rows };
  });

  /** Every marker with one name, across the library, newest videos first. */
  app.get<{ Querystring: { name?: string; offset?: string } }>("/api/markers", async (request, reply) => {
    const key = (request.query.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key) {
      reply.code(400);
      return { error: "Choose a position." };
    }
    const offset = Math.max(0, Math.floor(Number(request.query.offset) || 0));
    const rows = await db
      .select({
        ...columns,
        item: {
          id: mediaItems.id,
          title: mediaItems.title,
          thumbnailFile: mediaItems.thumbnailFile,
          durationSeconds: mediaItems.durationSeconds,
          releaseDate: mediaItems.releaseDate,
        },
        studio: studios.name,
      })
      .from(mediaItemMarkers)
      .innerJoin(mediaItems, eq(mediaItems.id, mediaItemMarkers.mediaItemId))
      .leftJoin(studios, eq(studios.id, mediaItems.studioId))
      .where(and(visibleItems(profileId(request)), sql`${groupKey} = ${key}`))
      .orderBy(desc(mediaItems.createdAt), asc(mediaItems.id), asc(mediaItemMarkers.startSeconds))
      .limit(PAGE_SIZE + 1)
      .offset(offset);
    return {
      markers: rows.slice(0, PAGE_SIZE),
      nextOffset: rows.length > PAGE_SIZE ? offset + PAGE_SIZE : null,
    };
  });

  app.get("/api/tpdb", async () => ({ configured: getTpdbKey() !== null, fetchAll: fetchAllStatus() }));

  app.post("/api/tpdb/fetch-all", async (request, reply) => {
    const apiKey = getTpdbKey();
    if (!apiKey) {
      reply.code(400);
      return { error: NO_KEY };
    }
    if (fetchAll.running) {
      reply.code(409);
      return { error: "Already fetching positions." };
    }
    const ids = await videosToCheck(profileId(request));
    fetchAll = {
      running: true,
      total: ids.length,
      checked: 0,
      matched: 0,
      markers: 0,
      failed: 0,
      error: null,
      finishedAt: null,
    };
    fetchAllDone = runFetchAll(apiKey, ids, gapMs).catch(() => {
      fetchAll.running = false;
    });
    reply.code(202);
    return fetchAllStatus();
  });
}
