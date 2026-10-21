import { and, asc, desc, eq, max, sql } from "drizzle-orm";
import { visibleItems } from "../library/visibility.js";
import type { FastifyInstance } from "fastify";
import { compileSmartRule, smartRuleError, type SmartRule } from "../collections/ruleCompiler.js";
import { db } from "../db/client.js";
import { collectionItems, collections, mediaItemTypes, mediaItems } from "../db/schema.js";
import { playbackWarningFor } from "../media/compatibility.js";
import { isId, parseId, parsePage } from "./mediaItemQueries.js";

const PAGE_SIZE = 50;
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
/** A reorder carries every id in the collection; this bounds one request. */
const MAX_REORDER = 10_000;

const itemColumns = {
  id: mediaItems.id,
  itemType: mediaItemTypes.name,
  title: mediaItems.title,
  durationSeconds: mediaItems.durationSeconds,
  extraMetadata: mediaItems.extraMetadata,
  missingSince: mediaItems.missingSince,
  createdAt: mediaItems.createdAt,
};

function withPlaybackWarning<T extends { itemType: string; extraMetadata: unknown }>(item: T) {
  return {
    ...item,
    playbackWarning: playbackWarningFor(
      item.itemType,
      item.extraMetadata as Record<string, unknown> | null
    ),
  };
}

export async function collectionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/collections", async () => {
    const rows = await db.select().from(collections).orderBy(collections.name);
    return { collections: rows };
  });

  app.post<{
    Body: { name: string; description?: string; type: "manual" | "smart"; smartRule?: SmartRule };
  }>("/api/collections", async (request, reply) => {
    const body = (request.body ?? {}) as Partial<typeof request.body>;
    const { description, type, smartRule } = body;
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name) {
      reply.code(400);
      return { error: "name is required" };
    }
    if (name.length > MAX_NAME_LENGTH) {
      reply.code(400);
      return { error: `name can be at most ${MAX_NAME_LENGTH} characters` };
    }
    if (type !== "manual" && type !== "smart") {
      reply.code(400);
      return { error: "type must be 'manual' or 'smart'" };
    }
    if (
      description !== undefined &&
      description !== null &&
      (typeof description !== "string" || description.length > MAX_DESCRIPTION_LENGTH)
    ) {
      reply.code(400);
      return { error: `description must be a string of at most ${MAX_DESCRIPTION_LENGTH} characters` };
    }
    if (type === "smart" && !smartRule) {
      reply.code(400);
      return { error: "smartRule is required for a smart collection" };
    }
    const ruleError = type === "smart" ? smartRuleError(smartRule) : null;
    if (ruleError) {
      reply.code(400);
      return { error: ruleError };
    }

    const [collection] = await db
      .insert(collections)
      .values({
        name,
        description: description ?? null,
        type,
        smartRule: type === "smart" ? smartRule : null,
      })
      .returning();

    reply.code(201);
    return collection;
  });

  app.delete<{ Params: { id: string } }>("/api/collections/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) {
      reply.code(404);
      return { error: "Not found" };
    }

    // Membership rows first: collection_items has a foreign key to
    // collections, so the parent cannot be removed while they exist.
    //
    // Every row, not just the in-scope ones. This previously filtered on
    // `mediaItems.inScope` while deleting from collection_items alone — a
    // table the statement never joins — so Postgres rejected it outright
    // ("missing FROM-clause entry") and deleting a collection did nothing at
    // all. Scope is a display concern anyway; a hidden item's membership
    // still has to go when its collection does.
    await db.delete(collectionItems).where(eq(collectionItems.collectionId, id));

    const deleted = await db.delete(collections).where(eq(collections.id, id)).returning();
    if (deleted.length === 0) {
      reply.code(404);
      return { error: "Not found" };
    }
    return { ok: true };
  });

  app.get<{ Params: { id: string }; Querystring: { page?: string } }>(
    "/api/collections/:id/items",
    async (request, reply) => {
      const id = parseId(request.params.id);
      const pageNum = parsePage(request.query.page);
      if (id === null) {
        reply.code(404);
        return { error: "Not found" };
      }
      if (pageNum === null) {
        reply.code(400);
        return { error: "page must be a positive whole number" };
      }

      const [collection] = await db.select().from(collections).where(eq(collections.id, id));
      if (!collection) {
        reply.code(404);
        return { error: "Not found" };
      }

      const baseQuery = db
        .select(itemColumns)
        .from(mediaItems)
        .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id));

      const defaultOrder = [desc(mediaItems.createdAt), desc(mediaItems.id)];

      let rows;
      if (collection.type === "manual") {
        rows = await baseQuery
          .innerJoin(collectionItems, eq(collectionItems.mediaItemId, mediaItems.id))
          .where(and(eq(collectionItems.collectionId, id), visibleItems()))
          .orderBy(asc(collectionItems.position), ...defaultOrder)
          .limit(PAGE_SIZE + 1)
          .offset((pageNum - 1) * PAGE_SIZE);
      } else {
        const rule = collection.smartRule as SmartRule;
        rows = await baseQuery
          .where(and(compileSmartRule(rule), visibleItems()))
          .orderBy(...defaultOrder)
          .limit(PAGE_SIZE + 1)
          .offset((pageNum - 1) * PAGE_SIZE);
      }

      const hasMore = rows.length > PAGE_SIZE;
      const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

      return {
        items: pageRows.map(withPlaybackWarning),
        page: pageNum,
        pageSize: PAGE_SIZE,
        hasMore,
      };
    }
  );

  app.post<{ Params: { id: string }; Body: { mediaItemId: number } }>(
    "/api/collections/:id/items",
    async (request, reply) => {
      const collectionId = parseId(request.params.id);
      if (collectionId === null) {
        reply.code(404);
        return { error: "Not found" };
      }
      const mediaItemId = (request.body as { mediaItemId?: unknown } | undefined)?.mediaItemId;
      if (!isId(mediaItemId)) {
        reply.code(400);
        return { error: "mediaItemId must be a positive whole number" };
      }

      const [collection] = await db
        .select()
        .from(collections)
        .where(eq(collections.id, collectionId));
      if (!collection) {
        reply.code(404);
        return { error: "Not found" };
      }
      if (collection.type !== "manual") {
        reply.code(400);
        return { error: "Cannot manually add items to a smart collection" };
      }

      // Checked up front rather than left to the foreign key, which would
      // surface an unknown id as a 500.
      const [item] = await db
        .select({ id: mediaItems.id })
        .from(mediaItems)
        .where(eq(mediaItems.id, mediaItemId));
      if (!item) {
        reply.code(404);
        return { error: "Media item not found" };
      }

      const [{ nextPos }] = await db
        .select({ nextPos: sql<number>`coalesce(max(${collectionItems.position}), 0) + 1` })
        .from(collectionItems)
        .where(eq(collectionItems.collectionId, collectionId));

      await db
        .insert(collectionItems)
        .values({ collectionId, mediaItemId, position: nextPos })
        .onConflictDoNothing();

      reply.code(201);
      return { ok: true };
    }
  );

  app.delete<{ Params: { id: string; mediaItemId: string } }>(
    "/api/collections/:id/items/:mediaItemId",
    async (request, reply) => {
      const collectionId = parseId(request.params.id);
      const mediaItemId = parseId(request.params.mediaItemId);
      if (collectionId === null || mediaItemId === null) {
        reply.code(404);
        return { error: "Not found" };
      }
      await db
        .delete(collectionItems)
        .where(
          and(
            eq(collectionItems.collectionId, collectionId),
            eq(collectionItems.mediaItemId, mediaItemId)
          )
        );
      return { ok: true };
    }
  );

  app.put<{ Params: { id: string }; Body: { orderedIds: number[] } }>(
    "/api/collections/:id/items/reorder",
    async (request, reply) => {
      const collectionId = parseId(request.params.id);
      if (collectionId === null) {
        reply.code(404);
        return { error: "Not found" };
      }
      const orderedIds = (request.body as { orderedIds?: unknown } | undefined)?.orderedIds;
      if (!Array.isArray(orderedIds) || !orderedIds.every(isId)) {
        reply.code(400);
        return { error: "orderedIds must be an array of positive whole numbers" };
      }
      if (orderedIds.length > MAX_REORDER) {
        reply.code(400);
        return { error: `orderedIds can hold at most ${MAX_REORDER} ids` };
      }
      if (new Set(orderedIds).size !== orderedIds.length) {
        reply.code(400);
        return { error: "orderedIds must not repeat an id" };
      }

      const [collection] = await db
        .select()
        .from(collections)
        .where(eq(collections.id, collectionId));
      if (!collection) {
        reply.code(404);
        return { error: "Not found" };
      }
      if (collection.type !== "manual") {
        reply.code(400);
        return { error: "Cannot reorder a smart collection" };
      }

      // One statement rather than one UPDATE per item — and, being a single
      // statement, atomic without an explicit transaction. The ids are
      // unnested alongside their index, which becomes the new position; ids
      // that aren't in this collection simply match no row.
      if (orderedIds.length > 0) {
        const idList = sql.join(
          orderedIds.map((id) => sql`${id}`),
          sql`, `,
        );
        await db.execute(sql`
          update ${collectionItems}
          set position = ordered.position - 1
          from unnest(array[${idList}]::int[])
            with ordinality as ordered(media_item_id, position)
          where ${collectionItems.collectionId} = ${collectionId}
            and ${collectionItems.mediaItemId} = ordered.media_item_id
        `);
      }

      return { ok: true };
    }
  );
}
