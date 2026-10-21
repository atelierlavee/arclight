import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { mediaItemTags, mediaItems, tags } from "../db/schema.js";
import { logActivity } from "../activity/log.js";
import { parseId } from "./mediaItemQueries.js";

/** Generous for a tag editor, small enough that one request can't create thousands of rows. */
const MAX_TAGS = 200;
const MAX_TAG_LENGTH = 100;

export async function tagRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/tags", async () => {
    const rows = await db.select().from(tags).orderBy(tags.name);
    return { tags: rows };
  });

  // Replaces the full tag set for an item in one call (rather than separate
  // add/remove endpoints) — matches how a tag editor UI naturally works: you
  // edit the whole list, then save. Unknown tag names are created on the fly.
  app.put<{ Params: { id: string }; Body: { tagNames: string[] } }>(
    "/api/media-items/:id/tags",
    async (request, reply) => {
      const itemId = parseId(request.params.id);
      if (itemId === null) {
        reply.code(404);
        return { error: "Not found" };
      }

      const raw = (request.body as { tagNames?: unknown } | undefined)?.tagNames;
      if (!Array.isArray(raw) || !raw.every((n) => typeof n === "string")) {
        reply.code(400);
        return { error: "tagNames must be an array of strings" };
      }
      // Blank entries are dropped rather than rejected — a trailing comma in
      // the editor is not worth failing the save over.
      const tagNames = [...new Set((raw as string[]).map((n) => n.trim()).filter(Boolean))];
      if (tagNames.length > MAX_TAGS) {
        reply.code(400);
        return { error: `An item can have at most ${MAX_TAGS} tags` };
      }
      if (tagNames.some((n) => n.length > MAX_TAG_LENGTH)) {
        reply.code(400);
        return { error: `Tag names can be at most ${MAX_TAG_LENGTH} characters` };
      }

      const [item] = await db.select().from(mediaItems).where(eq(mediaItems.id, itemId));
      if (!item) {
        reply.code(404);
        return { error: "Not found" };
      }

      // One transaction, so a failure part-way can't leave the item with its
      // old tags deleted and the new ones never written. Tags are resolved in
      // bulk: insert whatever is new (a concurrent save creating the same
      // name is absorbed by ON CONFLICT), then read every id back in one go.
      const assigned = await db.transaction(async (tx) => {
        let tagRows: (typeof tags.$inferSelect)[] = [];
        if (tagNames.length > 0) {
          await tx
            .insert(tags)
            .values(tagNames.map((name) => ({ name })))
            .onConflictDoNothing({ target: tags.name });
          tagRows = await tx.select().from(tags).where(inArray(tags.name, tagNames));
        }

        await tx.delete(mediaItemTags).where(eq(mediaItemTags.mediaItemId, itemId));
        if (tagRows.length > 0) {
          await tx
            .insert(mediaItemTags)
            .values(tagRows.map((tag) => ({ mediaItemId: itemId, tagId: tag.id })));
        }
        return tagRows.sort((a, b) => a.name.localeCompare(b.name));
      });

      await logActivity(
        "tag",
        `Tags on "${item.title}" set to ${tagNames.length > 0 ? tagNames.join(", ") : "(none)"}`,
        { tagNames },
        itemId,
      );

      return { tags: assigned };
    }
  );
}
