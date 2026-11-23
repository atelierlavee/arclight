// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { scanJobs } from "../db/schema.js";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import { attachFile, makeItem, makeLibrary } from "../test/fixtures.js";

let app: FastifyInstance;
let cookie: string;
let libraryId: number;
let rootId: number;

beforeAll(async () => {
  app = await testApp();
});
beforeEach(async () => {
  await resetDatabase();
  cookie = await signIn();
  ({ libraryId, rootId } = await makeLibrary());
});

const get = (url: string) =>
  app.inject({ method: "GET", url, headers: { cookie } });

describe("GET /api/scan/latest", () => {
  // An ordinary state on a new install, not a failed lookup.
  it("reports null rather than 404 when nothing has ever been scanned", async () => {
    const response = await get("/api/scan/latest");
    expect(response.statusCode).toBe(200);
    expect(response.json().job).toBeNull();
  });

  it("returns the newest job with its change counts", async () => {
    await db.insert(scanJobs).values({ status: "completed", itemsNew: 1 });
    const [newer] = await db
      .insert(scanJobs)
      .values({
        status: "completed",
        itemsNew: 24,
        itemsUpdated: 8,
        itemsMoved: 5,
        itemsMissing: 2,
        itemsSkipped: 100,
      })
      .returning();

    const { job } = (await get("/api/scan/latest")).json();
    expect(job.id).toBe(newer.id);
    expect(job.itemsNew).toBe(24);
    expect(job.itemsUpdated).toBe(8);
    expect(job.itemsMoved).toBe(5);
    expect(job.itemsMissing).toBe(2);
    expect(job.itemsSkipped).toBe(100);
  });

  // "latest" is a static segment and must never be parsed as a job id.
  it("does not collide with the job-by-id route", async () => {
    const [job] = await db
      .insert(scanJobs)
      .values({ status: "completed" })
      .returning();
    expect((await get(`/api/scan/${job.id}`)).json().id).toBe(job.id);
    expect((await get("/api/scan/latest")).json().job.id).toBe(job.id);
  });

  it("needs a session, like every other library route", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/scan/latest",
    });
    expect(response.statusCode).toBe(401);
  });
});

describe("GET /api/library/duplicates", () => {
  const dup = async (hash: string, title: string, path: string, size = 1000) => {
    const id = await makeItem(libraryId, { title });
    await attachFile(id, rootId, path, hash, size);
    return id;
  };

  it("is empty when every file is unique", async () => {
    await dup("aaa", "One", "/one.mp4");
    await dup("bbb", "Two", "/two.mp4");
    const body = (await get("/api/library/duplicates")).json();
    expect(body.groups).toEqual([]);
    expect(body.reclaimableBytes).toBe(0);
  });

  // The point of a duplicate report: the same footage stored twice under two
  // different names, which a filename comparison cannot see.
  it("groups files by content hash regardless of their names", async () => {
    await dup("same", "Holiday", "/a/holiday.mp4", 5000);
    await dup("same", "Copy of holiday", "/b/copy.mp4", 5000);
    await dup("other", "Unrelated", "/c/other.mp4");

    const body = (await get("/api/library/duplicates")).json();
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].contentHash).toBe("same");
    expect(body.groups[0].files.map((f: { path: string }) => f.path).sort()).toEqual([
      "/a/holiday.mp4",
      "/b/copy.mp4",
    ]);
  });

  it("reports what keeping one copy of each would free", async () => {
    await dup("same", "A", "/a.mp4", 5000);
    await dup("same", "B", "/b.mp4", 5000);
    await dup("same", "C", "/c.mp4", 5000);
    // Three copies, two redundant.
    expect((await get("/api/library/duplicates")).json().reclaimableBytes).toBe(
      10_000,
    );
  });

  it("carries the size and path of each copy, so a choice can be made", async () => {
    await dup("same", "A", "/a.mp4", 1000);
    await dup("same", "B", "/b.mp4", 1000);
    const file = (await get("/api/library/duplicates")).json().groups[0].files[0];
    expect(file).toMatchObject({ path: "/a.mp4", sizeBytes: 1000 });
    expect(file.title).toBeTruthy();
    expect(file.discoveredAt).toBeTruthy();
  });

  // A folder you stopped scanning should not still be reporting faults.
  it("ignores items whose folder was removed from the scan list", async () => {
    const kept = await makeItem(libraryId, { title: "Kept" });
    const dropped = await makeItem(libraryId, {
      title: "Dropped",
      inScope: false,
    });
    await attachFile(kept, rootId, "/kept.mp4", "same");
    await attachFile(dropped, rootId, "/dropped.mp4", "same");

    expect((await get("/api/library/duplicates")).json().groups).toEqual([]);
  });

  it("ignores files that have never been hashed", async () => {
    const a = await makeItem(libraryId, { title: "A" });
    const b = await makeItem(libraryId, { title: "B" });
    await attachFile(a, rootId, "/a.mp4", null);
    await attachFile(b, rootId, "/b.mp4", null);
    expect((await get("/api/library/duplicates")).json().groups).toEqual([]);
  });

  it("needs a session", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/library/duplicates",
    });
    expect(response.statusCode).toBe(401);
  });
});
