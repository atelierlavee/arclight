import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import { makeFolder, makeItem, makeLibrary } from "../test/fixtures.js";
import { db } from "../db/client.js";
import { mediaItems, playbackStates, series } from "../db/schema.js";

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

const inject = (
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  payload?: unknown,
) => app.inject({ method, url, headers: { cookie }, payload: payload as object });

describe("PATCH /api/media-items/:id — structure fields", () => {
  it("moves an item into a folder", async () => {
    const folder = await makeFolder(libraryId);
    const item = await makeItem(libraryId);
    const res = await inject("PATCH", `/api/media-items/${item}`, { parentId: folder });
    expect(res.statusCode).toBe(200);
    const [row] = await db.select().from(mediaItems).where(eq(mediaItems.id, item));
    expect(row.parentId).toBe(folder);
  });

  it("rejects a move that would put a folder inside its own descendant", async () => {
    const outer = await makeFolder(libraryId, "Outer");
    const middle = await makeFolder(libraryId, "Middle");
    const inner = await makeFolder(libraryId, "Inner");
    expect((await inject("PATCH", `/api/media-items/${middle}`, { parentId: outer })).statusCode).toBe(200);
    expect((await inject("PATCH", `/api/media-items/${inner}`, { parentId: middle })).statusCode).toBe(200);

    const res = await inject("PATCH", `/api/media-items/${outer}`, { parentId: inner });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/descendant/);
    const [row] = await db.select().from(mediaItems).where(eq(mediaItems.id, outer));
    expect(row.parentId).toBeNull();
  });

  it("rejects self-parenting, unknown parents and malformed parent ids", async () => {
    const item = await makeItem(libraryId);
    expect((await inject("PATCH", `/api/media-items/${item}`, { parentId: item })).statusCode).toBe(400);
    expect((await inject("PATCH", `/api/media-items/${item}`, { parentId: 999999 })).statusCode).toBe(400);
    expect((await inject("PATCH", `/api/media-items/${item}`, { parentId: "1" })).statusCode).toBe(400);
    expect((await inject("PATCH", `/api/media-items/${item}`, { parentId: 1.5 })).statusCode).toBe(400);
  });

  it("accepts null to move back to the root", async () => {
    const folder = await makeFolder(libraryId);
    const item = await makeItem(libraryId, { parentId: folder });
    expect((await inject("PATCH", `/api/media-items/${item}`, { parentId: null })).statusCode).toBe(200);
  });

  it("validates series, season and episode, and marks them user-owned", async () => {
    const item = await makeItem(libraryId);
    const [show] = await db.insert(series).values({ libraryId, name: "Show" }).returning();

    expect((await inject("PATCH", `/api/media-items/${item}`, { seriesId: 999999 })).statusCode).toBe(400);
    expect((await inject("PATCH", `/api/media-items/${item}`, { seriesId: "x" })).statusCode).toBe(400);
    expect((await inject("PATCH", `/api/media-items/${item}`, { seasonNumber: -1 })).statusCode).toBe(400);
    expect((await inject("PATCH", `/api/media-items/${item}`, { episodeNumber: 2.5 })).statusCode).toBe(400);
    expect((await inject("PATCH", `/api/media-items/${item}`, { episodeNumber: "3" })).statusCode).toBe(400);

    const res = await inject("PATCH", `/api/media-items/${item}`, {
      seriesId: show.id,
      seasonNumber: 0,
      episodeNumber: 4,
    });
    expect(res.statusCode).toBe(200);
    const [row] = await db.select().from(mediaItems).where(eq(mediaItems.id, item));
    expect(row).toMatchObject({ seriesId: show.id, seasonNumber: 0, episodeNumber: 4, seriesSource: "user" });

    expect((await inject("PATCH", `/api/media-items/${item}`, { seasonNumber: null })).statusCode).toBe(200);
  });

  it("rejects wrongly typed scalar fields with 400", async () => {
    const item = await makeItem(libraryId);
    for (const body of [{ title: 5 }, { description: 5 }, { isFavorite: "yes" }, { studio: 1 }, { kind: 3 }]) {
      expect((await inject("PATCH", `/api/media-items/${item}`, body)).statusCode).toBe(400);
    }
  });

  it("returns 404 for a malformed id", async () => {
    expect((await inject("PATCH", "/api/media-items/abc", { title: "x" })).statusCode).toBe(404);
  });
});

describe("playback for unknown items", () => {
  it("returns 404 rather than a foreign-key 500", async () => {
    expect((await inject("PUT", "/api/media-items/999999/playback", { positionSeconds: 5 })).statusCode).toBe(404);
    expect((await inject("PUT", "/api/media-items/999999/watched", { watched: true })).statusCode).toBe(404);
    expect((await inject("PUT", "/api/media-items/abc/playback", { positionSeconds: 5 })).statusCode).toBe(404);
    expect((await inject("GET", "/api/media-items/abc/heatmap")).statusCode).toBe(404);
  });

  it("rounds a fractional position into the integer column", async () => {
    const item = await makeItem(libraryId);
    const res = await inject("PUT", `/api/media-items/${item}/playback`, { positionSeconds: 12.6 });
    expect(res.statusCode).toBe(200);
    const [row] = await db.select().from(playbackStates).where(eq(playbackStates.mediaItemId, item));
    expect(row.positionSeconds).toBe(13);
  });
});

describe("hidden items", () => {
  it("404s playback reads and writes for a hidden item while the vault is locked", async () => {
    const item = await makeItem(libraryId, { hiddenAt: new Date() });
    expect((await inject("GET", `/api/media-items/${item}/heatmap`)).statusCode).toBe(404);
    expect((await inject("PUT", `/api/media-items/${item}/playback`, { positionSeconds: 5 })).statusCode).toBe(404);
    expect((await inject("PUT", `/api/media-items/${item}/watched`, { watched: true })).statusCode).toBe(404);
  });
});

describe("GET /api/kinds/:kind/cover", () => {
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])(
    "returns 404 for the inherited property %s",
    async (kind) => {
      const res = await inject("GET", `/api/kinds/${kind}/cover`);
      expect(res.statusCode).toBe(404);
    },
  );
});

describe("query-string validation", () => {
  it("rejects malformed ids and pages on /api/media-items", async () => {
    expect((await inject("GET", "/api/media-items?libraryId=abc")).statusCode).toBe(400);
    expect((await inject("GET", "/api/media-items?parentId=abc")).statusCode).toBe(400);
    expect((await inject("GET", "/api/media-items?page=abc")).statusCode).toBe(400);
    expect((await inject("GET", `/api/media-items?libraryId=${libraryId}`)).statusCode).toBe(200);
  });

  it("ignores out-of-range numeric filters rather than failing", async () => {
    const res = await inject(
      "GET",
      "/api/media-items?minDuration=1e12&maxDuration=1e12&addedWithin=1e12&year=1e12",
    );
    expect(res.statusCode).toBe(200);
  });

  it("rejects a malformed inbox page", async () => {
    expect((await inject("GET", "/api/inbox?page=abc")).statusCode).toBe(400);
    expect((await inject("GET", "/api/inbox?page=0")).statusCode).toBe(400);
    expect((await inject("GET", "/api/inbox?page=2")).statusCode).toBe(200);
  });

  it("rejects non-integer triage ids", async () => {
    expect((await inject("POST", "/api/inbox/triage", { ids: ["1"] })).statusCode).toBe(400);
    expect((await inject("POST", "/api/inbox/triage", { ids: [1.5] })).statusCode).toBe(400);
    expect((await inject("POST", "/api/inbox/triage", {})).statusCode).toBe(400);
  });
});

describe("PATCH /api/settings", () => {
  it("rejects a non-boolean lanExposed instead of coercing it", async () => {
    const res = await inject("PATCH", "/api/settings", { network: { lanExposed: "false" } });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown hero source and drops out-of-range ids", async () => {
    expect((await inject("PATCH", "/api/settings", { hero: { source: "nope" } })).statusCode).toBe(400);
    const res = await inject("PATCH", "/api/settings", {
      hero: { source: "manual", itemIds: [3, 3, 99999999999, -1, "4"] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().hero.itemIds).toEqual([3]);
  });

  it("rejects an empty body", async () => {
    expect((await inject("PATCH", "/api/settings")).statusCode).toBe(400);
  });
});

describe("categories", () => {
  it("rejects a non-string label and a non-integer position", async () => {
    expect((await inject("POST", "/api/categories", { label: 5 })).statusCode).toBe(400);
    const created = await inject("POST", "/api/categories", { label: "Clips" });
    const id = created.json().category.id;
    expect((await inject("PATCH", `/api/categories/${id}`, { label: 5 })).statusCode).toBe(400);
    expect((await inject("PATCH", `/api/categories/${id}`, { position: "2" })).statusCode).toBe(400);
    expect((await inject("PATCH", `/api/categories/${id}`, { position: 2 })).statusCode).toBe(200);
    expect((await inject("PATCH", "/api/categories/abc", { position: 2 })).statusCode).toBe(404);
  });
});
