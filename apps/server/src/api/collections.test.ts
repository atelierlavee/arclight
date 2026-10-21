import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import { makeItem, makeLibrary } from "../test/fixtures.js";
import { db } from "../db/client.js";
import { collectionItems } from "../db/schema.js";

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

const inject = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: unknown) =>
  app.inject({ method, url, headers: { cookie }, payload: payload as object });

async function makeManualCollection(name = "Mine"): Promise<number> {
  const res = await inject("POST", "/api/collections", { name, type: "manual" });
  expect(res.statusCode).toBe(201);
  return res.json().id;
}

describe("POST /api/collections", () => {
  it("trims the name", async () => {
    const res = await inject("POST", "/api/collections", { name: "  Trimmed  ", type: "manual" });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe("Trimmed");
  });

  it.each([
    [{ type: "manual" }],
    [{ name: "   ", type: "manual" }],
    [{ name: 42, type: "manual" }],
    [{ name: "x".repeat(201), type: "manual" }],
    [{ name: "ok", type: "weird" }],
    [{ name: "ok", type: "manual", description: 7 }],
  ])("rejects %j with 400", async (body) => {
    const res = await inject("POST", "/api/collections", body);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeTruthy();
  });
});

describe("collection items", () => {
  it("rejects a malformed mediaItemId with 400 and an unknown one with 404", async () => {
    const id = await makeManualCollection();
    expect((await inject("POST", `/api/collections/${id}/items`, { mediaItemId: "1" })).statusCode).toBe(400);
    expect((await inject("POST", `/api/collections/${id}/items`, { mediaItemId: 999999 })).statusCode).toBe(404);
  });

  it("returns 404 for a malformed collection id and 400 for a bad page", async () => {
    const id = await makeManualCollection();
    expect((await inject("GET", "/api/collections/abc/items")).statusCode).toBe(404);
    expect((await inject("GET", `/api/collections/${id}/items?page=abc`)).statusCode).toBe(400);
    expect((await inject("GET", `/api/collections/${id}/items?page=2`)).statusCode).toBe(200);
  });
});

describe("PUT /api/collections/:id/items/reorder", () => {
  it("rewrites every position in one go", async () => {
    const id = await makeManualCollection();
    const a = await makeItem(libraryId, { title: "A" });
    const b = await makeItem(libraryId, { title: "B" });
    const c = await makeItem(libraryId, { title: "C" });
    for (const mediaItemId of [a, b, c]) {
      await inject("POST", `/api/collections/${id}/items`, { mediaItemId });
    }

    const res = await inject("PUT", `/api/collections/${id}/items/reorder`, {
      orderedIds: [c, a, b],
    });
    expect(res.statusCode).toBe(200);

    const rows = await db
      .select()
      .from(collectionItems)
      .where(eq(collectionItems.collectionId, id))
      .orderBy(asc(collectionItems.position));
    expect(rows.map((r) => [r.mediaItemId, r.position])).toEqual([
      [c, 0],
      [a, 1],
      [b, 2],
    ]);

    const listed = await inject("GET", `/api/collections/${id}/items`);
    expect(listed.json().items.map((i: { id: number }) => i.id)).toEqual([c, a, b]);
  });

  it("accepts an empty list", async () => {
    const id = await makeManualCollection();
    const res = await inject("PUT", `/api/collections/${id}/items/reorder`, { orderedIds: [] });
    expect(res.statusCode).toBe(200);
  });

  it.each([
    [{}],
    [{ orderedIds: "1,2" }],
    [{ orderedIds: [1, "2"] }],
    [{ orderedIds: [1.5] }],
    [{ orderedIds: [0] }],
    [{ orderedIds: [1, 1] }],
  ])("rejects %j with 400", async (body) => {
    const id = await makeManualCollection();
    const res = await inject("PUT", `/api/collections/${id}/items/reorder`, body);
    expect(res.statusCode).toBe(400);
  });
});
