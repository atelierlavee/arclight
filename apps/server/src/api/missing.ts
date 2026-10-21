import { and, isNotNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { logActivity } from "../activity/log.js";
import { privacyLocked } from "../auth/privacyUnlock.js";
import { isScanRunning } from "../scanner/pipeline.js";
import { isVaultUnlocked } from "../auth/vaultUnlock.js";
import { db } from "../db/client.js";
import { mediaItems } from "../db/schema.js";
import {
  forgetAllMissingVideos,
  forgetItems,
  listMissingVideos,
} from "../library/forget.js";

/**
 * Managing videos whose files have gone.
 *
 * Deliberately its own route rather than a DELETE on /api/media-items/:id.
 * Removing a library record is destructive and irreversible, and the only
 * items it is ever safe to offer it for are the ones whose files are already
 * gone. Scoping the endpoint to those means a stray id cannot delete an item
 * that is sitting on disk perfectly fine, whatever the caller intended.
 */
/** Drops vault items from a list, keeping its order. */
async function withoutHidden<T extends { id: number }>(items: T[]): Promise<T[]> {
  if (items.length === 0) return items;
  const hidden = await db
    .select({ id: mediaItems.id })
    .from(mediaItems)
    // Every hidden missing item rather than "these ids": the list can be
    // long, and one bound parameter per id is a limit waiting to be hit.
    .where(and(isNotNull(mediaItems.hiddenAt), isNotNull(mediaItems.missingSince)));
  if (hidden.length === 0) return items;
  const hiddenIds = new Set(hidden.map((row) => row.id));
  return items.filter((item) => !hiddenIds.has(item.id));
}

export async function missingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/missing", async (request, reply) => {
    if (await privacyLocked(request, reply)) return reply;
    // Gated on the privacy credential, enforced here and not just in the UI:
    // a page that asks first protects nothing while the endpoint is one
    // request away. A hidden video whose file has gone is still a vault item,
    // so it stays out of this list unless this session has the vault open.
    const all = await listMissingVideos();
    const items = isVaultUnlocked(request.user?.sessionId)
      ? all
      : await withoutHidden(all);
    return { items };
  });

  app.post<{ Body: { ids?: unknown } }>(
    "/api/missing/forget",
    async (request, reply) => {
      if (await privacyLocked(request, reply)) return reply;
      // A scan running alongside could be clearing these very items' missing
      // flags while they are deleted.
      if (isScanRunning()) {
        return reply.code(409).send({ error: "A library scan is running — try again when it finishes" });
      }
      const raw = request.body?.ids;
      if (!Array.isArray(raw)) {
        return reply.code(400).send({ error: "ids must be an array" });
      }
      const ids = raw.filter(
        (id): id is number => typeof id === "number" && Number.isInteger(id),
      );
      if (ids.length === 0) {
        return reply.code(400).send({ error: "No valid ids" });
      }

      const removed = await forgetItems(ids);
      if (removed > 0) {
        await logActivity(
          "library",
          `Removed ${removed} missing ${removed === 1 ? "video" : "videos"} from the library`,
          { removed },
        );
      }
      // `removed` can be lower than what was asked for: an id that is no
      // longer missing, or never was, is skipped rather than deleted.
      return { removed };
    },
  );

  app.post("/api/missing/forget-all", async (request, reply) => {
    if (await privacyLocked(request, reply)) return reply;
    if (isScanRunning()) {
      return reply.code(409).send({ error: "A library scan is running — try again when it finishes" });
    }
    const removed = await forgetAllMissingVideos();
    if (removed > 0) {
      await logActivity(
        "library",
        `Removed all ${removed} missing ${removed === 1 ? "video" : "videos"} from the library`,
        { removed },
      );
    }
    return { removed };
  });
}
