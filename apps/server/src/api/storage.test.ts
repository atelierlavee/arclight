// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import { attachFile, linkPerformer, makeItem, makeLibrary, makePerformer, makeStudio } from "../test/fixtures.js";

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

const GB = 1024 ** 3;

describe("GET /api/storage/insights", () => {
  it("breaks the library down by studio, performer and resolution", async () => {
    const studio = await makeStudio("Big Studio");
    const performer = await makePerformer("Jane");
    const hd = await makeItem(libraryId, {
      title: "Scene HD",
      studioId: studio,
      releaseDate: "2020-01-01",
      durationSeconds: 1000,
      extraMetadata: { height: 1080 },
    });
    const sd = await makeItem(libraryId, {
      title: "Scene SD",
      studioId: studio,
      releaseDate: "2020-01-01",
      durationSeconds: 1000,
      extraMetadata: { height: 480 },
    });
    const loose = await makeItem(libraryId, { title: "Loose", extraMetadata: { height: 2160 } });
    await attachFile(hd, rootId, "/lib/hd.mp4", null, 4 * GB);
    await attachFile(sd, rootId, "/lib/sd.mp4", null, 1 * GB);
    await attachFile(loose, rootId, "/lib/loose.mp4", null, 2 * GB);
    await linkPerformer(hd, performer);
    await linkPerformer(sd, performer);

    const body = (await app.inject({ url: "/api/storage/insights", headers: { cookie } })).json();

    expect(body.totals.videos).toEqual({ items: 3, bytes: 7 * GB, seconds: 2000 });
    expect(body.byStudio).toMatchObject([
      { name: "Big Studio", items: 2, videos: 2, photos: 0, bytes: 5 * GB },
      { name: "No studio", items: 1, videos: 1, photos: 0, bytes: 2 * GB },
    ]);
    // Pictured by its largest video.
    expect(body.byStudio[0].representative).toEqual({ id: hd, thumbnailFile: null });
    expect(body.byPerformer).toMatchObject([
      { id: performer, name: "Jane", items: 2, videos: 2, photos: 0, bytes: 5 * GB, hasImage: false },
    ]);
    expect(body.byYear).toEqual({
      years: [{ year: 2020, items: 2, bytes: 5 * GB }],
      undated: { items: 1, bytes: 2 * GB },
    });
    expect(Object.fromEntries(body.byResolution.map((r: { key: string; items: number }) => [r.key, r.items]))).toEqual({
      "4k": 1,
      fullhd: 1,
      hd: 0,
      sd: 1,
    });
    expect(body.largest.map((r: { title: string }) => r.title)).toEqual(["Scene HD", "Loose", "Scene SD"]);
    expect(body.largest[0].bitrateMbps).toBeCloseTo((4 * GB * 8) / 1000 / 1e6, 0);

    expect(body.lowerQualityCopies).toHaveLength(1);
    expect(body.lowerQualityCopies[0]).toMatchObject({
      studio: "Big Studio",
      releaseDate: "2020-01-01",
      reclaimableBytes: 1 * GB,
    });
    expect(body.lowerQualityCopies[0].items.map((i: { title: string }) => i.title)).toEqual(["Scene HD", "Scene SD"]);
  });

  it("does not call two encodes at the same height a lower-quality copy", async () => {
    const studio = await makeStudio("S");
    for (const title of ["A", "B"]) {
      await makeItem(libraryId, { title, studioId: studio, releaseDate: "2021-05-05", extraMetadata: { height: 1080 } });
    }
    const body = (await app.inject({ url: "/api/storage/insights", headers: { cookie } })).json();
    expect(body.lowerQualityCopies).toEqual([]);
  });
});
