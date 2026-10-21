import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { libraries, mediaItemTypes, mediaItems } from "../db/schema.js";
import { notHidden } from "../library/visibility.js";

import { profileId } from "../auth/profileContext.js";
export async function folderRoutes(app: FastifyInstance): Promise<void> {
  // Flat list of every folder (id + title + parentId) — used by the "move to
  // folder" picker. There's no per-library scoping UI yet (single library,
  // per Phase 2), so this intentionally isn't paginated or filtered.
  app.get("/api/folders", async (request) => {
    const profile = profileId(request);
    const [folderType] = await db
      .select()
      .from(mediaItemTypes)
      .where(eq(mediaItemTypes.name, "folder"));
    if (!folderType) return { folders: [] };

    const rows = await db
      .select({ id: mediaItems.id, title: mediaItems.title, parentId: mediaItems.parentId })
      .from(mediaItems)
      // A folder in the vault stays out of the picker like it stays out of
      // the grid; offering it as a destination would name it.
      .where(and(eq(mediaItems.itemTypeId, folderType.id), notHidden(profile)))
      .orderBy(mediaItems.title);

    return { folders: rows };
  });

  app.post<{ Body: { title: string; parentId?: number | null } }>(
    "/api/folders",
    async (request, reply) => {
      const { title, parentId } = request.body;
      if (!title?.trim()) {
        reply.code(400);
        return { error: "title is required" };
      }

      const [folderType] = await db
        .select()
        .from(mediaItemTypes)
        .where(eq(mediaItemTypes.name, "folder"));
      if (!folderType) {
        reply.code(500);
        return { error: "folder item type is not seeded" };
      }

      // Single-library app for now (Phase 2) — always file new folders under
      // the one seeded library rather than exposing a library picker.
      const [library] = await db.select().from(libraries).limit(1);
      if (!library) {
        reply.code(500);
        return { error: "No library configured" };
      }

      const [folder] = await db
        .insert(mediaItems)
        .values({
          libraryId: library.id,
          itemTypeId: folderType.id,
          title: title.trim(),
          parentId: parentId ?? null,
        })
        .returning();

      reply.code(201);
      return folder;
    }
  );
}
