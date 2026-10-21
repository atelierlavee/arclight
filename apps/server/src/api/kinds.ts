import { sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { mediaItems } from "../db/schema.js";
import { visibleItems } from "../library/visibility.js";
import { deleteKindCover, kindCoverPath, saveKindCover } from "../media/kindCovers.js";
import { streamFile } from "../media/streamer.js";
import { categorySlugs } from "./mediaItemQueries.js";
import { getKindCovers, kindCoverFor, setKindCover } from "./settings.js";

import { profileId } from "../auth/profileContext.js";
export async function kindRoutes(app: FastifyInstance): Promise<void> {
  // Backs the category tiles on the home page.
  app.get("/api/kinds", async (request) => {
    const profile = profileId(request);
    const rows = await db
      .select({
        kind: mediaItems.kind,
        total: sql<number>`count(*)::int`,
        // Newest item of that kind, for the tile's backdrop.
        representativeItemId: sql<number | null>`max(${mediaItems.id})`,
      })
      .from(mediaItems)
      .where(visibleItems(profile))
      .groupBy(mediaItems.kind);

    const byKind = new Map(rows.map((r) => [r.kind, r]));
    const covers = await getKindCovers();
    const slugs = [...(await categorySlugs())];
    return {
      kinds: slugs.map((kind) => ({
        kind,
        total: byKind.get(kind)?.total ?? 0,
        representativeItemId: byKind.get(kind)?.representativeItemId ?? null,
        // Folded into the URL so replacing a cover changes it, letting the
        // response be cached hard.
        cover: kindCoverFor(covers, kind)
          ? `/api/kinds/${kind}/cover?v=${kindCoverFor(covers, kind)}`
          : null,
      })),
    };
  });

  app.get<{ Params: { kind: string } }>("/api/kinds/:kind/cover", async (request, reply) => {
    const kind = request.params.kind;
    // Only a known category can have a cover, and the lookup is an own-key
    // one — `constructor` or `__proto__` must not resolve to anything.
    const fileName = (await categorySlugs()).has(kind)
      ? kindCoverFor(await getKindCovers(), kind)
      : undefined;
    if (!fileName) {
      reply.code(404);
      return { error: "No cover" };
    }
    reply.header("Cache-Control", "private, max-age=31536000, immutable");
    await streamFile(reply, kindCoverPath(fileName), "image/jpeg", undefined, false);
  });

  app.post<{ Params: { kind: string } }>("/api/kinds/:kind/cover", async (request, reply) => {
    const kind = request.params.kind;
    if (!(await categorySlugs()).has(kind)) {
      reply.code(400);
      return { error: "Unknown category" };
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
      fileName = await saveKindCover(buffer, kind);
    } catch {
      reply.code(400);
      return { error: "That file could not be read as an image" };
    }

    const previous = kindCoverFor(await getKindCovers(), kind);
    await setKindCover(kind, fileName);
    // Only after the setting points at the new file, so a failure here leaves
    // a stray file rather than a broken reference.
    await deleteKindCover(previous);

    return { ok: true };
  });

  app.delete<{ Params: { kind: string } }>("/api/kinds/:kind/cover", async (request, reply) => {
    const kind = request.params.kind;
    if (!(await categorySlugs()).has(kind)) {
      reply.code(400);
      return { error: "Unknown category" };
    }
    const previous = kindCoverFor(await getKindCovers(), kind);
    await setKindCover(kind, null);
    await deleteKindCover(previous);
    return { ok: true };
  });
}
