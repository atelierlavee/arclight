import { and, asc, eq, ne, sql } from "drizzle-orm";
import { visibleItems } from "../library/visibility.js";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { categories, mediaItems, mediaItemTypes } from "../db/schema.js";
import { deleteKindCover, kindCoverPath, saveKindCover } from "../media/kindCovers.js";
import { streamFile } from "../media/streamer.js";

/** Lowercase, hyphenated, so it's safe in a URL and stable as a key. */
function toSlug(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function categoryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/categories", async () => {
    const rows = await db.select().from(categories).orderBy(asc(categories.position), asc(categories.id));

    // Photos carry a `kind` too — the column defaults to "video" and nothing
    // ever changes it for them — so counting by kind alone reported every
    // still in the library as a video. Categories apply to videos only, which
    // is also how every listing query already treats them.
    const videosOnly = and(visibleItems(), eq(mediaItemTypes.name, "video"));

    const counts = await db
      .select({ kind: mediaItems.kind, total: sql<number>`count(*)::int` })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItemTypes.id, mediaItems.itemTypeId))
      .where(videosOnly)
      .groupBy(mediaItems.kind);
    const totalBySlug = new Map(counts.map((c) => [c.kind, c.total]));

    // Newest item per category, for the tile's fallback artwork. Same filter,
    // or a tile could show a still from an album as its cover.
    const newest = await db
      .select({ kind: mediaItems.kind, itemId: sql<number>`max(${mediaItems.id})` })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItemTypes.id, mediaItems.itemTypeId))
      .where(videosOnly)
      .groupBy(mediaItems.kind);
    const newestBySlug = new Map(newest.map((n) => [n.kind, n.itemId]));

    return {
      categories: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        label: row.label,
        position: row.position,
        total: totalBySlug.get(row.slug) ?? 0,
        representativeItemId: newestBySlug.get(row.slug) ?? null,
        // Folded into the URL so replacing a cover changes it, which lets the
        // response be cached hard.
        cover: row.coverFile ? `/api/categories/${row.slug}/cover?v=${row.coverFile}` : null,
        coverPositionX: row.coverPositionX,
        coverPositionY: row.coverPositionY,
        coverScale: row.coverScale,
      })),
    };
  });

  app.post<{ Body: { label?: string } }>("/api/categories", async (request, reply) => {
    const label = request.body.label?.trim();
    if (!label) {
      reply.code(400);
      return { error: "Name is required" };
    }
    const slug = toSlug(label);
    if (!slug) {
      reply.code(400);
      return { error: "That name has no usable letters or numbers" };
    }

    // Slug *and* label, because the seeded slugs are singular ("movie") while
    // their labels are plural ("Movies") — so typing the visible name back
    // would otherwise create a second category that looks identical.
    const [existing] = await db
      .select()
      .from(categories)
      .where(sql`${categories.slug} = ${slug} or lower(${categories.label}) = lower(${label})`);
    if (existing) {
      reply.code(409);
      return { error: `"${existing.label}" already exists` };
    }

    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${categories.position}), -1)` })
      .from(categories);

    const [created] = await db
      .insert(categories)
      .values({ slug, label, position: max + 1 })
      .returning();
    return { category: created };
  });

  // Label and order only. The slug is deliberately immutable: items reference
  // it, so changing it would orphan every item in the category.
  app.patch<{
    Params: { id: string };
    Body: {
      label?: string;
      position?: number;
      coverPositionX?: number;
      coverPositionY?: number;
      coverScale?: number;
    };
  }>(
    "/api/categories/:id",
    async (request, reply) => {
      const id = Number(request.params.id);
      const patch: {
        label?: string;
        position?: number;
        coverPositionX?: number;
        coverPositionY?: number;
        coverScale?: number;
      } = {};

      if (request.body.label !== undefined) {
        const label = request.body.label.trim();
        if (!label) {
          reply.code(400);
          return { error: "Name cannot be empty" };
        }
        const [clash] = await db
          .select()
          .from(categories)
          .where(sql`lower(${categories.label}) = lower(${label}) and ${categories.id} <> ${id}`);
        if (clash) {
          reply.code(409);
          return { error: `"${clash.label}" already exists` };
        }
        patch.label = label;
      }
      if (request.body.position !== undefined) patch.position = request.body.position;
      if (request.body.coverPositionX !== undefined) {
        const value = Number(request.body.coverPositionX);
        if (!Number.isFinite(value)) {
          reply.code(400);
          return { error: "coverPositionX must be a number" };
        }
        patch.coverPositionX = Math.round(Math.max(0, Math.min(100, value)));
      }
      if (request.body.coverPositionY !== undefined) {
        const value = Number(request.body.coverPositionY);
        if (!Number.isFinite(value)) {
          reply.code(400);
          return { error: "coverPositionY must be a number" };
        }
        // Clamped rather than rejected: it's a percentage from a drag, and a
        // value slightly outside the range is a rounding artefact, not a
        // reason to fail the save. Matches how the performer banner's
        // position is handled.
        patch.coverPositionY = Math.round(Math.max(0, Math.min(100, value)));
      }
      if (request.body.coverScale !== undefined) {
        const value = Number(request.body.coverScale);
        if (!Number.isFinite(value)) {
          reply.code(400);
          return { error: "coverScale must be a number" };
        }
        // Floor of 100: below that the image would no longer cover the tile
        // and would show bars down the sides. The ceiling keeps a low-res
        // cover from being magnified into mush.
        patch.coverScale = Math.round(Math.max(100, Math.min(300, value)));
      }

      const updated = await db
        .update(categories)
        .set(patch)
        .where(eq(categories.id, id))
        .returning();
      if (updated.length === 0) {
        reply.code(404);
        return { error: "Not found" };
      }
      return { category: updated[0] };
    }
  );

  app.delete<{ Params: { id: string } }>("/api/categories/:id", async (request, reply) => {
    const id = Number(request.params.id);
    const [category] = await db.select().from(categories).where(eq(categories.id, id));
    if (!category) {
      reply.code(404);
      return { error: "Not found" };
    }

    // Items must land somewhere, or they'd vanish from every category view
    // while still sitting in the library. With no other category left there is
    // nowhere to move them: they keep their slug, which every view tolerates
    // (the detail modal already shows a slug whose category was deleted).
    const [fallback] = await db
      .select()
      .from(categories)
      .where(ne(categories.id, id))
      .orderBy(asc(categories.position), asc(categories.id))
      .limit(1);

    const moved = fallback
      ? await db
          .update(mediaItems)
          .set({ kind: fallback.slug })
          .where(eq(mediaItems.kind, category.slug))
          .returning({ id: mediaItems.id })
      : [];

    await db.delete(categories).where(eq(categories.id, id));
    await deleteKindCover(category.coverFile);

    return { ok: true, movedCount: moved.length, movedTo: fallback?.label ?? null };
  });

  app.get<{ Params: { slug: string } }>(
    "/api/categories/:slug/cover",
    async (request, reply) => {
      const [category] = await db
        .select()
        .from(categories)
        .where(eq(categories.slug, request.params.slug));
      if (!category?.coverFile) {
        reply.code(404);
        return { error: "No cover" };
      }
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
      await streamFile(reply, kindCoverPath(category.coverFile), "image/jpeg", undefined, false);
    }
  );

  app.post<{ Params: { slug: string } }>(
    "/api/categories/:slug/cover",
    async (request, reply) => {
      const [category] = await db
        .select()
        .from(categories)
        .where(eq(categories.slug, request.params.slug));
      if (!category) {
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
        fileName = await saveKindCover(buffer, category.slug);
      } catch {
        reply.code(400);
        return { error: "That file could not be read as an image" };
      }

      await db.update(categories).set({ coverFile: fileName }).where(eq(categories.id, category.id));
      // Only after the row points at the new file.
      await deleteKindCover(category.coverFile);
      return { ok: true };
    }
  );

  app.delete<{ Params: { slug: string } }>(
    "/api/categories/:slug/cover",
    async (request, reply) => {
      const [category] = await db
        .select()
        .from(categories)
        .where(eq(categories.slug, request.params.slug));
      if (!category) {
        reply.code(404);
        return { error: "Not found" };
      }
      await db.update(categories).set({ coverFile: null }).where(eq(categories.id, category.id));
      await deleteKindCover(category.coverFile);
      return { ok: true };
    }
  );
}
