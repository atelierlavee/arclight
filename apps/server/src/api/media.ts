// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import path from "node:path";
import { serialized } from "../auth/serialize.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { isAuthorisedCastStream } from "../auth/castTokens.js";
import { canSeeHidden, hiddenGate, viewerProfile } from "../library/visibility.js";
import { db } from "../db/client.js";
import { libraryRoots, mediaFiles, mediaItems, mediaItemTypes } from "../db/schema.js";
import {
  deleteItemThumbnail,
  itemThumbnailPath,
  saveItemThumbnail,
} from "../media/itemThumbnails.js";
import { streamFile } from "../media/streamer.js";
import { listSubtitleTracks, readSubtitleAsVtt } from "../media/subtitles.js";
import { previewPathFor } from "../media/preview.js";
import { ensureScrubSprite, spritePathFor } from "../media/scrubSprite.js";
import { getOrCreatePhotoThumbnail, getPosterPath } from "../media/thumbnails.js";
import { playbackWarningFor } from "../media/compatibility.js";
import { backfillAudioCodec, needsAudioCodec } from "../media/audioCodecBackfill.js";
import { probeVideo } from "../metadata/videoProbe.js";
import {
  closeAllTranscodeSessions,
  closeTranscodeSession,
  createTranscodeSession,
  getTranscodeSession,
  initializeTranscodeStorage,
  transcodePlaylist,
  transcodeAssetPath,
  TranscodeCapacityError,
} from "../media/transcode.js";

import { itemHiddenAt } from "../library/profileState.js";
type ResolvedFile = {
  itemType: string;
  hidden: boolean;
  filePath: string;
  mimeType: string | null;
  contentHash: string | null;
  extraMetadata: Record<string, unknown> | null;
  durationSeconds: number | null;
};

function isPathUnderRoot(filePath: string, root: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedFile = path.resolve(filePath);
  return resolvedFile === resolvedRoot || resolvedFile.startsWith(resolvedRoot + path.sep);
}

// Defense in depth: filePath comes from our own DB, not raw user input, but we
// still confirm it's still within one of the item's library roots before ever
// serving bytes from it.
//
// A vault item resolves only when `allowHidden` says so — the session has the
// vault open, or the request carries a cast token (which is only ever issued
// for an item the issuing session could see). Otherwise it is "not found",
// the same as an id that does not exist: ids are sequential, and the bytes of
// a hidden video are the thing the vault exists to keep out of reach.
async function resolveItemFile(
  itemId: number,
  allowHidden: boolean,
  profile: number,
): Promise<ResolvedFile | null> {
  const [row] = await db
    .select({
      itemType: mediaItemTypes.name,
      hidden: sql<boolean>`(${itemHiddenAt(profile, mediaItems.id)} is not null)`,
      libraryId: mediaItems.libraryId,
      filePath: mediaFiles.path,
      mimeType: mediaFiles.mimeType,
      contentHash: mediaFiles.contentHash,
      extraMetadata: mediaItems.extraMetadata,
      durationSeconds: mediaItems.durationSeconds,
    })
    .from(mediaItems)
    .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
    .innerJoin(mediaFiles, eq(mediaFiles.mediaItemId, mediaItems.id))
    .where(and(eq(mediaItems.id, itemId), allowHidden ? undefined : isNull(itemHiddenAt(profile, mediaItems.id))));

  if (!row) return null;

  const roots = await db
    .select({ path: libraryRoots.path })
    .from(libraryRoots)
    .where(eq(libraryRoots.libraryId, row.libraryId));

  const underRoot = roots.some((r) => isPathUnderRoot(row.filePath, r.path));
  if (!underRoot) return null;

  return {
    itemType: row.itemType,
    hidden: row.hidden,
    filePath: row.filePath,
    mimeType: row.mimeType,
    contentHash: row.contentHash,
    extraMetadata: row.extraMetadata as Record<string, unknown> | null,
    durationSeconds: row.durationSeconds,
  };
}

/**
 * A stream may serve a vault item to a session with the vault open, or to a
 * cast token. The TV fetching a cast link has no session at all; the token
 * stands in for one, and GET /api/media-items/:id/cast only signs one for an
 * item the asking session could open — so a valid token already carries that
 * permission and checking the (absent) session again would only break casting.
 */
function streamMayShowHidden(request: FastifyRequest): boolean {
  return canSeeHidden(request) || isAuthorisedCastStream(request.method, request.url);
}

/**
 * Generated images are content-addressed (the URL changes with the file), so
 * they can be cached for good — but only by this browser: `private`, never
 * `public`, because every one of them sits behind a login and a shared cache
 * has no business holding a copy. A vault item's are not cached at all, so
 * locking the vault leaves nothing of it behind on disk.
 */
function mediaCacheControl(hidden: boolean): string {
  return hidden ? "private, no-store" : "private, max-age=31536000, immutable";
}

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  await initializeTranscodeStorage();
  app.addHook("onClose", closeAllTranscodeSessions);

  app.post<{ Params: { id: string } }>(
    "/api/media-items/:id/transcodes",
    async (request, reply) => {
      const id = Number(request.params.id);
      const profileId = viewerProfile(request);
      const file = await resolveItemFile(id, canSeeHidden(request), profileId);
      if (!file || file.itemType !== "video") {
        reply.code(404);
        return { error: "Not found" };
      }
      // The same gap the detail route fills; checked here too in case the
      // player asks before the detail has been refetched.
      let extraMetadata = file.extraMetadata;
      if (needsAudioCodec(extraMetadata)) {
        extraMetadata = (await backfillAudioCodec(id)) ?? extraMetadata;
      }
      if (!playbackWarningFor("video", extraMetadata)) {
        reply.code(409);
        return { error: "This video can be played directly" };
      }
      const durationSeconds =
        file.durationSeconds ?? (await probeVideo(file.filePath)).durationSeconds;
      if (!durationSeconds || durationSeconds <= 0) {
        reply.code(422);
        return { error: "Could not determine the video duration; rescan the library and try again" };
      }

      try {
        const sessionId = await createTranscodeSession(
          id,
          profileId,
          file.filePath,
          durationSeconds,
        );
        reply.code(201);
        return { sessionId };
      } catch (error) {
        if (error instanceof TranscodeCapacityError) {
          reply.code(429);
          return { error: error.message };
        }
        throw error;
      }
    },
  );

  app.get<{ Params: { sessionId: string; asset: string } }>(
    "/api/transcodes/:sessionId/:asset",
    async (request, reply) => {
      const profileId = viewerProfile(request);
      const session = getTranscodeSession(request.params.sessionId, profileId);
      if (!session) {
        reply.code(404);
        return { error: "Not found" };
      }

      const file = await resolveItemFile(
        session.itemId,
        streamMayShowHidden(request),
        profileId,
      );
      if (!file || file.itemType !== "video" || file.filePath !== session.sourcePath) {
        await closeTranscodeSession(request.params.sessionId, profileId);
        reply.code(404);
        return { error: "Not found" };
      }

      reply.header("Cache-Control", file.hidden ? "private, no-store" : "private, no-cache");
      if (request.params.asset === "index.m3u8") {
        const playlist = transcodePlaylist(request.params.sessionId, profileId);
        if (!playlist) {
          reply.code(404);
          return { error: "Not found" };
        }
        reply.type("application/vnd.apple.mpegurl; charset=utf-8");
        return reply.send(playlist);
      }

      let assetPath: string | null;
      try {
        assetPath = await transcodeAssetPath(
          request.params.sessionId,
          profileId,
          request.params.asset,
        );
      } catch (error) {
        reply.code(500);
        console.warn(
          `transcode: playback failed for session ${request.params.sessionId}:`,
          error instanceof Error ? error.message : error,
        );
        return {
          error: "Could not transcode this video",
        };
      }
      if (!assetPath) {
        reply.code(404);
        return { error: "Transcode output not found" };
      }

      reply.type("video/mp2t");
      await streamFile(
        reply,
        assetPath,
        "video/mp2t",
        request.headers.range,
        false,
      );
    },
  );

  app.delete<{ Params: { sessionId: string } }>(
    "/api/transcodes/:sessionId",
    async (request, reply) => {
      await closeTranscodeSession(request.params.sessionId, viewerProfile(request));
      reply.code(204).send();
    },
  );

  app.get<{ Params: { itemId: string } }>(
    "/api/stream/:itemId",
    // Registered manually below instead, so a HEAD request doesn't actually
    // open/stream the file just to have Fastify's default auto-HEAD discard it.
    { exposeHeadRoute: false },
    async (request, reply) => {
      const file = await resolveItemFile(Number(request.params.itemId), streamMayShowHidden(request), viewerProfile(request));
      if (!file) {
        reply.code(404);
        return { error: "Not found" };
      }
      // Nothing of a vault item is kept in the browser's cache.
      if (file.hidden) reply.header("Cache-Control", "private, no-store");
      await streamFile(
        reply,
        file.filePath,
        file.mimeType ?? "application/octet-stream",
        request.headers.range,
        false
      );
    }
  );

  app.head<{ Params: { itemId: string } }>("/api/stream/:itemId", async (request, reply) => {
    const file = await resolveItemFile(Number(request.params.itemId), streamMayShowHidden(request), viewerProfile(request));
    if (!file) {
      reply.code(404).send();
      return;
    }
    await streamFile(
      reply,
      file.filePath,
      file.mimeType ?? "application/octet-stream",
      request.headers.range,
      true
    );
  });

  /**
   * The subtitle tracks beside a video, for the player's CC menu. Found by
   * reading the folder (media/subtitles.ts), so the list is always current.
   * Answers like the stream does: a vault video's subtitles are as hidden as
   * its bytes.
   */
  app.get<{ Params: { id: string } }>(
    "/api/media-items/:id/subtitles",
    async (request, reply) => {
      const file = await resolveItemFile(Number(request.params.id), canSeeHidden(request), viewerProfile(request));
      if (!file || file.itemType !== "video") {
        reply.code(404);
        return { error: "Not found" };
      }
      if (file.hidden) reply.header("Cache-Control", "private, no-store");
      const tracks = await listSubtitleTracks(file.filePath);
      // The server-side path stays server side.
      return { tracks: tracks.map(({ index, language, label }) => ({ index, language, label })) };
    },
  );

  /** One track as WebVTT, named by its position in the list above. */
  app.get<{ Params: { id: string; index: string } }>(
    "/api/media-items/:id/subtitles/:index",
    async (request, reply) => {
      const file = await resolveItemFile(Number(request.params.id), canSeeHidden(request), viewerProfile(request));
      if (!file || file.itemType !== "video" || !/^\d{1,3}$/.test(request.params.index)) {
        reply.code(404);
        return { error: "Not found" };
      }
      const track = (await listSubtitleTracks(file.filePath))[Number(request.params.index)];
      const vtt = track ? await readSubtitleAsVtt(track.file) : null;
      if (vtt === null) {
        reply.code(404);
        return { error: "Not found" };
      }
      // Nothing of a vault item is kept in the browser's cache; the rest may
      // be reused briefly, but not for long — the file beside the video can be
      // replaced at any time.
      reply.header("Cache-Control", file.hidden ? "private, no-store" : "private, max-age=60");
      reply.type("text/vtt; charset=utf-8");
      return vtt;
    },
  );

  // Short, low-res clip cut at scan time. Unlike seeking into the full file,
  // this starts instantly and its first frame is the poster image, so the
  // still-to-motion hand-off is invisible.
  app.get<{ Params: { id: string } }>(
    "/api/media-items/:id/preview",
    async (request, reply) => {
      const id = Number(request.params.id);
      const file = await resolveItemFile(id, canSeeHidden(request), viewerProfile(request));
      if (!file || file.itemType !== "video") {
        reply.code(404);
        return { error: "Not found" };
      }

      if (file.hidden) reply.header("Cache-Control", "private, no-store");
      await streamFile(
        reply,
        previewPathFor(id, file.contentHash),
        "video/mp4",
        request.headers.range,
        false
      );
    }
  );

  /**
   * The seek-bar preview layout, building the sprite on first request.
   *
   * The first call for a video can take several seconds; the player asks as
   * playback starts, so it is ready by the time you reach for the bar, and
   * the bar works as a plain seek bar until then.
   */
  app.get<{ Params: { id: string } }>(
    "/api/media-items/:id/scrub",
    async (request, reply) => {
      const id = Number(request.params.id);
      const file = await resolveItemFile(id, canSeeHidden(request), viewerProfile(request));
      const [item] = await db
        .select({ durationSeconds: mediaItems.durationSeconds })
        .from(mediaItems)
        .where(eq(mediaItems.id, id));
      if (!file || file.itemType !== "video" || !item?.durationSeconds) {
        reply.code(404);
        return { error: "Not found" };
      }

      const info = await ensureScrubSprite(file.filePath, id, file.contentHash, item.durationSeconds);
      if (info === "offline") {
        reply.code(404);
        return { error: "The video file is not reachable — is its drive connected?", offline: true };
      }
      if (!info) {
        reply.code(404);
        return { error: "No preview frames could be read from this video" };
      }
      // The hash is in the URL so a re-encoded file gets a new image rather
      // than a year-cached one from before.
      return { ...info, url: `/api/media-items/${id}/scrub.jpg?v=${file.contentHash ?? "nohash"}` };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/media-items/:id/scrub.jpg",
    async (request, reply) => {
      const id = Number(request.params.id);
      const file = await resolveItemFile(id, canSeeHidden(request), viewerProfile(request));
      if (!file || file.itemType !== "video") {
        reply.code(404);
        return { error: "Not found" };
      }
      reply.header("Cache-Control", mediaCacheControl(file.hidden));
      await streamFile(reply, spritePathFor(id, file.contentHash), "image/jpeg", request.headers.range, false);
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/media-items/:id/thumbnail",
    async (request, reply) => serialized(`thumb:${request.params.id}`, async () => {
      const id = Number(request.params.id);
      const [item] = await db
        .select()
        .from(mediaItems)
        .where(and(eq(mediaItems.id, id), hiddenGate(request)));
      if (!item) {
        reply.code(404);
        return { error: "Not found" };
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
        fileName = await saveItemThumbnail(buffer, id);
      } catch {
        reply.code(400);
        return { error: "That file could not be read as an image" };
      }

      const previous = item.thumbnailFile;
      await db
        .update(mediaItems)
        .set({ thumbnailFile: fileName, updatedAt: new Date() })
        .where(eq(mediaItems.id, id));
      // Only after the row points at the new file, so a failure here leaves a
      // stray file rather than a broken reference.
      await deleteItemThumbnail(previous);

      return { ok: true, thumbnailFile: fileName };
    })
  );

  // Reverts to the generated poster.
  app.delete<{ Params: { id: string } }>(
    "/api/media-items/:id/thumbnail",
    async (request, reply) => serialized(`thumb:${request.params.id}`, async () => {
      const id = Number(request.params.id);
      const [item] = await db
        .select()
        .from(mediaItems)
        .where(and(eq(mediaItems.id, id), hiddenGate(request)));
      if (!item) {
        reply.code(404);
        return { error: "Not found" };
      }

      await db
        .update(mediaItems)
        .set({ thumbnailFile: null, updatedAt: new Date() })
        .where(eq(mediaItems.id, id));
      await deleteItemThumbnail(item.thumbnailFile);

      return { ok: true };
    })
  );

  app.get<{ Params: { id: string } }>(
    "/api/media-items/:id/thumbnail",
    async (request, reply) => {
      const id = Number(request.params.id);
      const file = await resolveItemFile(id, canSeeHidden(request), viewerProfile(request));
      if (!file) {
        reply.code(404);
        return { error: "Not found" };
      }

      // An uploaded override wins over anything generated.
      const [item] = await db
        .select({ thumbnailFile: mediaItems.thumbnailFile })
        .from(mediaItems)
        .where(eq(mediaItems.id, id));

      const thumbPath = item?.thumbnailFile
        ? itemThumbnailPath(item.thumbnailFile)
        : file.itemType === "video"
          ? await getPosterPath(id, file.contentHash)
          : await getOrCreatePhotoThumbnail(file.filePath, id, file.contentHash);

      if (!thumbPath) {
        reply.code(404);
        return { error: "No thumbnail available" };
      }

      reply.header("Cache-Control", mediaCacheControl(file.hidden));
      await streamFile(reply, thumbPath, "image/jpeg", undefined, false);
    }
  );
}
