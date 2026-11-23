// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import {
  attachFile,
  makeFolder,
  makeItem,
  makeLibrary,
  makeLibraryAt,
} from "../test/fixtures.js";
import { isScanRunning } from "../scanner/pipeline.js";
import { seed } from "../db/seed.js";

/**
 * Waits for any in-flight scan to finish.
 *
 * A scan started by a test keeps running in the background after the test
 * ends, and the next test truncates the tables underneath it — which fails
 * intermittently and in a different place each time. A flaky suite is worse
 * than no suite, because you learn to ignore it.
 */
async function settleScan(): Promise<void> {
  for (let i = 0; i < 200 && isScanRunning(); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

let app: FastifyInstance;
let cookie: string;
let libraryId: number;
let rootId: number;
let dir: string;

beforeAll(async () => {
  app = await testApp();
});
beforeEach(async () => {
  await resetDatabase();
  cookie = await signIn();
  ({ libraryId, rootId } = await makeLibrary());
  dir = await mkdtemp(path.join(tmpdir(), "routes-test-"));
});
afterEach(async () => {
  // Belt and braces: no test may leave a scan running into the next one.
  await settleScan();
  await rm(dir, { recursive: true, force: true });
});

const get = (url: string, headers: Record<string, string> = {}) =>
  app.inject({ method: "GET", url, headers: { cookie, ...headers } });
const send = (
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  payload?: unknown,
) =>
  app.inject({ method, url, headers: { cookie }, payload: payload as object });

describe("collections", () => {
  it("creates a manual collection and lists its items in a stable order", async () => {
    const created = (
      await send("POST", "/api/collections", {
        name: "My List",
        type: "manual",
      })
    ).json();
    const a = await makeItem(libraryId, { title: "A" });
    const b = await makeItem(libraryId, { title: "B" });
    await send("POST", `/api/collections/${created.id}/items`, {
      mediaItemId: a,
    });
    await send("POST", `/api/collections/${created.id}/items`, {
      mediaItemId: b,
    });

    const body = (await get(`/api/collections/${created.id}/items`)).json();
    expect(body.items).toHaveLength(2);
    expect(body.hasMore).toBe(false);
    // Paged queries must be ordered, or rows repeat and vanish between pages.
    const again = (await get(`/api/collections/${created.id}/items`)).json();
    expect(again.items.map((i: { id: number }) => i.id)).toEqual(
      body.items.map((i: { id: number }) => i.id),
    );
  });

  it("requires a rule for a smart collection", async () => {
    const res = await send("POST", "/api/collections", {
      name: "Smart",
      type: "smart",
    });
    expect(res.statusCode).toBe(400);
  });

  it("evaluates a smart collection live", async () => {
    await makeItem(libraryId, { title: "Keep me" });
    await makeItem(libraryId, { title: "Ignore" });
    const created = (
      await send("POST", "/api/collections", {
        name: "Smart",
        type: "smart",
        smartRule: {
          op: "AND",
          conditions: [{ field: "title", op: "contains", value: "Keep" }],
        },
      })
    ).json();

    const body = (await get(`/api/collections/${created.id}/items`)).json();
    expect(body.items.map((i: { title: string }) => i.title)).toEqual([
      "Keep me",
    ]);
  });

  it("404s for a collection that does not exist", async () => {
    expect((await get("/api/collections/999999/items")).statusCode).toBe(404);
  });

  it("deletes a collection that still has items in it", async () => {
    // The delete used to filter membership rows on `mediaItems.inScope` while
    // deleting from collection_items alone — a table the statement never
    // joins. Postgres rejected it outright, so the sidebar's delete button
    // silently did nothing for any non-empty collection.
    const created = (
      await send("POST", "/api/collections", {
        name: "My List",
        type: "manual",
      })
    ).json();
    const item = await makeItem(libraryId, { title: "In the list" });
    await send("POST", `/api/collections/${created.id}/items`, {
      mediaItemId: item,
    });

    expect(
      (await send("DELETE", `/api/collections/${created.id}`)).statusCode,
    ).toBe(200);
    expect((await get("/api/collections")).json().collections).toEqual([]);
    // The video itself survives — a collection is a grouping, not ownership.
    expect((await get(`/api/media-items/${item}`)).statusCode).toBe(200);
  });

  it("still deletes an empty collection", async () => {
    const created = (
      await send("POST", "/api/collections", { name: "Empty", type: "manual" })
    ).json();
    expect(
      (await send("DELETE", `/api/collections/${created.id}`)).statusCode,
    ).toBe(200);
  });

  it("404s when deleting a collection that does not exist", async () => {
    expect((await send("DELETE", "/api/collections/999999")).statusCode).toBe(
      404,
    );
  });
});

describe("folders", () => {
  it("creates a folder and moves an item into it", async () => {
    const folder = (
      await send("POST", "/api/folders", { title: "Box" })
    ).json();
    const item = await makeItem(libraryId, { title: "X" });
    await send("PATCH", `/api/media-items/${item}`, { parentId: folder.id });

    const body = (await get(`/api/media-items?parentId=${folder.id}`)).json();
    expect(body.items.map((i: { title: string }) => i.title)).toEqual(["X"]);
  });

  it("lists folders for the move picker", async () => {
    await makeFolder(libraryId, "Existing");
    const body = (await get("/api/folders")).json();
    expect(body.folders.map((f: { title: string }) => f.title)).toContain(
      "Existing",
    );
  });
});

describe("settings", () => {
  it("returns hero and scan settings with the allowed intervals", async () => {
    const body = (await get("/api/settings")).json();
    expect(body.hero).toBeDefined();
    expect(body.scan.intervalMinutes).toBeTypeOf("number");
    expect(body.scanIntervals).toContain(0);
  });

  it("saves a hero selection", async () => {
    const item = await makeItem(libraryId, { title: "Featured" });
    await send("PATCH", "/api/settings", {
      hero: { source: "manual", itemIds: [item] },
    });

    const body = (await get("/api/settings")).json();
    expect(body.hero).toEqual({ source: "manual", itemIds: [item] });
  });

  it("falls back to the default for an interval not on the allow-list", async () => {
    // Coerced rather than rejected: the UI only offers valid values, so a
    // stray one is a hand-edited request, and a sane default beats a 500 on
    // the next boot from a nonsense stored interval.
    const res = await send("PATCH", "/api/settings", {
      scan: { intervalMinutes: 7 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().scan.intervalMinutes).not.toBe(7);
  });

  it("accepts an interval that is on the allow-list", async () => {
    const res = await send("PATCH", "/api/settings", {
      scan: { intervalMinutes: 30 },
    });
    expect(res.json().scan.intervalMinutes).toBe(30);
  });

  it("resolves the hero setting into real items", async () => {
    const item = await makeItem(libraryId, { title: "Featured" });
    await send("PATCH", "/api/settings", {
      hero: { source: "manual", itemIds: [item] },
    });

    const body = (await get("/api/hero-items")).json();
    expect(body.items.map((i: { title: string }) => i.title)).toEqual([
      "Featured",
    ]);
  });
});

describe("scan jobs", () => {
  it("reports a job's status", async () => {
    const started = await send("POST", "/api/scan");
    expect([202, 409]).toContain(started.statusCode);
    if (started.statusCode === 202) {
      const body = (await get(`/api/scan/${started.json().id}`)).json();
      expect(["running", "completed", "failed"]).toContain(body.status);
    }
    await settleScan();
  });

  it("404s for a job that does not exist", async () => {
    expect((await get("/api/scan/999999")).statusCode).toBe(404);
  });
});

describe("library roots", () => {
  it("lists configured folders with a file count", async () => {
    const body = (await get("/api/library/roots")).json();
    expect(body.roots).toHaveLength(1);
    expect(body.roots[0].path).toBe("/media");
  });

  it("refuses to browse outside the allowed roots", async () => {
    // Path traversal must not escape into the rest of the filesystem.
    const res = await get("/api/library/browse?path=/etc");
    expect([400, 403]).toContain(res.statusCode);
  });

  it("does not resurrect a removed folder on the next boot", async () => {
    // seed() used to recreate a root matching MEDIA_ROOT whenever one was
    // absent, so removing a folder in Site settings lasted until the next
    // restart — and added another "Library" row each time.
    const before = (await get("/api/library/roots")).json().roots;
    expect(before.length).toBeGreaterThan(0);

    await send("DELETE", `/api/library/roots/${before[0].id}`);
    expect((await get("/api/library/roots")).json().roots).toEqual([]);

    // Stands in for a restart.
    await seed();
    expect((await get("/api/library/roots")).json().roots).toEqual([]);
  });

  it("rejects adding a folder that does not exist", async () => {
    const res = await send("POST", "/api/library/roots", {
      path: "/definitely/not/here",
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe("streaming", () => {
  it("serves a file with range support", async () => {
    // The library root must actually contain the file: the streamer re-checks
    // the resolved path against the root rather than trusting the database.
    const { libraryId: id, rootId: fileRoot } = await makeLibraryAt(dir);
    const file = path.join(dir, "clip.mp4");
    await writeFile(file, "0123456789");
    const item = await makeItem(id, { title: "Clip" });
    await attachFile(item, fileRoot, file);

    const full = await get(`/api/stream/${item}`);
    expect([200, 206]).toContain(full.statusCode);
    expect(full.headers["accept-ranges"]).toBe("bytes");

    const partial = await get(`/api/stream/${item}`, { range: "bytes=0-3" });
    expect(partial.statusCode).toBe(206);
    expect(partial.headers["content-range"]).toContain("/10");
  });

  it("404s when the file is gone from disk", async () => {
    const item = await makeItem(libraryId, { title: "Missing" });
    await attachFile(item, rootId, path.join(dir, "never-written.mp4"));
    expect((await get(`/api/stream/${item}`)).statusCode).toBe(404);
  });

  it("404s for an item with no file at all", async () => {
    const item = await makeItem(libraryId, { title: "Fileless" });
    expect((await get(`/api/stream/${item}`)).statusCode).toBe(404);
  });
});

describe("backups", () => {
  it("lists backups without failing when none exist", async () => {
    const res = await get("/api/backups");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().backups)).toBe(true);
  });

  it("refuses a filename that tries to escape the backup directory", async () => {
    const res = await get("/api/backups/..%2F..%2Fetc%2Fpasswd");
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe("activity", () => {
  it("lists and clears activity events", async () => {
    const list = await get("/api/activity");
    expect(list.statusCode).toBe(200);
    expect(Array.isArray(list.json().events)).toBe(true);

    const cleared = await app.inject({
      method: "DELETE",
      url: "/api/activity",
      headers: { cookie },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toEqual({ ok: true });
  });
});
