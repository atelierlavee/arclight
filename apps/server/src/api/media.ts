import path from "node:path";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { isAuthorisedCastStream } from "../auth/castTokens.js";
import { canSeeHidden, hiddenGate } from "../library/visibility.js";
import { db } from "../db/client.js";
import { libraryRoots, mediaFiles, mediaItems, mediaItemTypes } from "../db/schema.js";
import {
  deleteItemThumbnail,
  itemThumbnailPath,
  saveItemThumbnail,
} from "../media/itemThumbnails.js";
import { streamFile } from "../media/streamer.js";
import { previewPathFor } from "../media/preview.js";
import { ensureScrubSprite, spritePathFor } from "../media/scrubSprite.js";
import { getOrCreatePhotoThumbnail, getPosterPath } from "../media/thumbnails.js";

type ResolvedFile = {
  itemType: string;
  hidden: boolean;
  filePath: string;
  mimeType: string | null;
  contentHash: string | null;
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
async function resolveItemFile(itemId: number, allowHidden: boolean): Promise<ResolvedFile | null> {
  const [row] = await db
    .select({
      itemType: mediaItemTypes.name,
      hidden: sql<boolean>`(${mediaItems.hiddenAt} is not null)`,
      libraryId: mediaItems.libraryId,
      filePath: mediaFiles.path,
      mimeType: mediaFiles.mimeType,
      contentHash: mediaFiles.contentHash,
    })
    .from(mediaItems)
    .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
    .innerJoin(mediaFiles, eq(mediaFiles.mediaItemId, mediaItems.id))
    .where(and(eq(mediaItems.id, itemId), allowHidden ? undefined : isNull(mediaItems.hiddenAt)));

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
  app.get<{ Params: { itemId: string } }>(
    "/api/stream/:itemId",
    // Registered manually below instead, so a HEAD request doesn't actually
    // open/stream the file just to have Fastify's default auto-HEAD discard it.
    { exposeHeadRoute: false },
    async (request, reply) => {
      const file = await resolveItemFile(Number(request.params.itemId), streamMayShowHidden(request));
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
    const file = await resolveItemFile(Number(request.params.itemId), streamMayShowHidden(request));
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

  // Short, low-res clip cut at scan time. Unlike seeking into the full file,
  // this starts instantly and its first frame is the poster image, so the
  // still-to-motion hand-off is invisible.
  app.get<{ Params: { id: string } }>(
    "/api/media-items/:id/preview",
    async (request, reply) => {
      const id = Number(request.params.id);
      const file = await resolveItemFile(id, canSeeHidden(request));
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
      const file = await resolveItemFile(id, canSeeHidden(request));
      const [item] = await db
        .select({ durationSeconds: mediaItems.durationSeconds })
        .from(mediaItems)
        .where(eq(mediaItems.id, id));
      if (!file || file.itemType !== "video" || !item?.durationSeconds) {
        reply.code(404);
        return { error: "Not found" };
      }

      const info = await ensureScrubSprite(file.filePath, id, file.contentHash, item.durationSeconds);
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
      const file = await resolveItemFile(id, canSeeHidden(request));
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
    async (request, reply) => {
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
    }
  );

  // Reverts to the generated poster.
  app.delete<{ Params: { id: string } }>(
    "/api/media-items/:id/thumbnail",
    async (request, reply) => {
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
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/media-items/:id/thumbnail",
    async (request, reply) => {
      const id = Number(request.params.id);
      const file = await resolveItemFile(id, canSeeHidden(request));
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
