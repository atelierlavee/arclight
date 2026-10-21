import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import { makeItem, makeLibrary, makeTag, linkTag } from "../test/fixtures.js";
import { db } from "../db/client.js";
import { mediaItemTags, tags } from "../db/schema.js";

let app: FastifyInstance;
let cookie: string;
let libraryId: number;

beforeAll(async () => {
  app = await testApp();
});

beforeEach(async () => {
  await resetDatabase();
  cookie = await signIn();
  ({ libraryId } = await makeLibrary());
});

const put = (url: string, payload?: unknown) =>
  app.inject({ method: "PUT", url, headers: { cookie }, payload: payload as object });

describe("PUT /api/media-items/:id/tags", () => {
  it("replaces the tag set, creating unknown tags and reusing existing ones", async () => {
    const itemId = await makeItem(libraryId);
    const existing = await makeTag("old");
    const kept = await makeTag("kept");
    await linkTag(itemId, existing);

    const res = await put(`/api/media-items/${itemId}/tags`, {
      tagNames: ["kept", " new ", "new", ""],
    });
    expect(res.statusCode).toBe(200);
    const names = res.json().tags.map((t: { name: string }) => t.name);
    expect(names).toEqual(["kept", "new"]);

    const links = await db
      .select()
      .from(mediaItemTags)
      .where(eq(mediaItemTags.mediaItemId, itemId));
    expect(links.map((l) => l.tagId)).toContain(kept);
    expect(links.map((l) => l.tagId)).not.toContain(existing);
    // "kept" was reused, not duplicated.
    expect(await db.select().from(tags).where(eq(tags.name, "kept"))).toHaveLength(1);
  });

  it("clears every tag with an empty list", async () => {
    const itemId = await makeItem(libraryId);
    await linkTag(itemId, await makeTag("gone"));
    const res = await put(`/api/media-items/${itemId}/tags`, { tagNames: [] });
    expect(res.statusCode).toBe(200);
    expect(res.json().tags).toEqual([]);
  });

  it("returns 400 when tagNames is missing", async () => {
    const itemId = await makeItem(libraryId);
    const res = await put(`/api/media-items/${itemId}/tags`, {});
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/tagNames/);
  });

  it("returns 400 when tagNames holds non-strings", async () => {
    const itemId = await makeItem(libraryId);
    const res = await put(`/api/media-items/${itemId}/tags`, { tagNames: ["ok", 5] });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an unknown or malformed item id", async () => {
    expect((await put("/api/media-items/999999/tags", { tagNames: ["a"] })).statusCode).toBe(404);
    expect((await put("/api/media-items/abc/tags", { tagNames: ["a"] })).statusCode).toBe(404);
  });
});
