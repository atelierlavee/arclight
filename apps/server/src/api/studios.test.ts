// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { categories, mediaItems } from "../db/schema.js";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import {
  linkPerformer,
  makeItem,
  makeLibrary,
  makePerformer,
  makePhoto,
  makeStudio,
} from "../test/fixtures.js";

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

const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });

describe("GET /api/studios", () => {
  it("counts each studio's videos and offers a frame for the card", async () => {
    const vixen = await makeStudio("Vixen");
    await makeItem(libraryId, { title: "One", studioId: vixen });
    const latest = await makeItem(libraryId, { title: "Two", studioId: vixen });

    const body = (await get("/api/studios")).json();
    expect(body.studios).toHaveLength(1);
    expect(body.studios[0]).toMatchObject({
      name: "Vixen",
      videoCount: 2,
      representativeItemId: latest,
    });
  });

  it("offers several frames to choose between, drawn from its videos", async () => {
    const vixen = await makeStudio("Vixen");
    const ids = [];
    for (let n = 0; n < 3; n++) {
      ids.push(await makeItem(libraryId, { title: `V${n}`, studioId: vixen }));
    }

    const [studio] = (await get("/api/studios")).json().studios;
    // Random order, so compare as sets.
    expect([...studio.frameItemIds].sort()).toEqual([...ids].sort());
  });

  it("draws frames from every video, not only the newest", async () => {
    const vixen = await makeStudio("Vixen");
    const ids: number[] = [];
    for (let n = 0; n < 12; n++) {
      ids.push(await makeItem(libraryId, { title: `V${n}`, studioId: vixen }));
    }
    const oldest = new Set(ids.slice(0, 4));

    // Over a few loads an older video turns up; newest-only never would.
    let sawOlder = false;
    for (let attempt = 0; attempt < 20 && !sawOlder; attempt++) {
      const [studio] = (await get("/api/studios")).json().studios;
      sawOlder = studio.frameItemIds.some((id: number) => oldest.has(id));
    }
    expect(sawOlder).toBe(true);
  });

  it("caps the frames rather than sending every video a studio has", async () => {
    const vixen = await makeStudio("Vixen");
    for (let n = 0; n < 11; n++) {
      await makeItem(libraryId, { title: `V${n}`, studioId: vixen });
    }

    const [studio] = (await get("/api/studios")).json().studios;
    expect(studio.frameItemIds).toHaveLength(8);
  });

  // Thumbnails are cached for a year by URL, so a frame's URL has to carry
  // its thumbnail version or a replaced thumbnail never shows on the card.
  it("sends each frame's thumbnail version, so a replaced thumbnail shows", async () => {
    const vixen = await makeStudio("Vixen");
    const plain = await makeItem(libraryId, { title: "Plain", studioId: vixen });
    const custom = await makeItem(libraryId, { title: "Custom", studioId: vixen });
    await db.update(mediaItems).set({ thumbnailFile: "custom-1.jpg" }).where(eq(mediaItems.id, custom));

    const [studio] = (await get("/api/studios")).json().studios;
    expect(studio.thumbnailFiles).toEqual({ [plain]: null, [custom]: "custom-1.jpg" });
  });

  // A LEFT JOIN gives a studio with nothing attached one null-padded row, and
  // array_agg would collect that null as a frame.
  it("gives a studio with no videos an empty list, not a list of nothing", async () => {
    await makeStudio("Nobody");
    const [studio] = (await get("/api/studios")).json().studios;
    expect(studio.frameItemIds).toEqual([]);
  });

  it("keeps a studio with no videos, and reports zero rather than one", async () => {
    // count(*) over a LEFT JOIN with no match counts the null-padded row.
    await makeStudio("Nobody");
    expect((await get("/api/studios")).json().studios[0].videoCount).toBe(0);
  });

  it("counts videos only, not an album's stills", async () => {
    // The count used to include photos: Vixen read as 553 where it has 8
    // scenes and 545 gallery images.
    const vixen = await makeStudio("Vixen");
    const video = await makeItem(libraryId, { title: "Scene", studioId: vixen });
    const photo = await makePhoto(libraryId, "still");
    await db.update(mediaItems).set({ studioId: vixen }).where(eq(mediaItems.id, photo));

    const body = (await get("/api/studios")).json().studios[0];
    expect(body.videoCount).toBe(1);
    // And the card's frame is the video, not whichever still scanned last.
    expect(body.representativeItemId).toBe(video);
  });

  it("does not count out-of-scope videos", async () => {
    const vixen = await makeStudio("Vixen");
    await makeItem(libraryId, { title: "Shown", studioId: vixen });
    await makeItem(libraryId, { title: "Hidden", studioId: vixen, inScope: false });

    expect((await get("/api/studios")).json().studios[0].videoCount).toBe(1);
  });

  it("sorts case-insensitively", async () => {
    await makeStudio("vixen");
    await makeStudio("Blacked");
    expect((await get("/api/studios")).json().studios.map((s: { name: string }) => s.name)).toEqual(
      ["Blacked", "vixen"]
    );
  });
});

describe("GET /api/studios/:id", () => {
  it("returns totals, years and who appears on them", async () => {
    const vixen = await makeStudio("Vixen");
    const alice = await makePerformer("Alice");
    const bella = await makePerformer("Bella");

    const one = await makeItem(libraryId, {
      title: "One",
      studioId: vixen,
      durationSeconds: 600,
      releaseDate: "2020-02-15",
    });
    const two = await makeItem(libraryId, {
      title: "Two",
      studioId: vixen,
      durationSeconds: 300,
      releaseDate: "2022-05-01",
    });
    await linkPerformer(one, alice);
    await linkPerformer(two, alice);
    await linkPerformer(two, bella);

    // Another studio's video, to prove the aggregates are actually scoped.
    const other = await makeStudio("Blacked");
    await linkPerformer(await makeItem(libraryId, { title: "Elsewhere", studioId: other }), alice);

    const body = (await get(`/api/studios/${vixen}`)).json();
    expect(body).toMatchObject({ name: "Vixen", videoCount: 2, totalDurationSeconds: 900 });
    expect(body.years).toEqual([
      { year: 2022, count: 1 },
      { year: 2020, count: 1 },
    ]);

    // Most-credited first, and `together` counts only this studio's videos
    // while videoCount is the performer's own catalogue.
    expect(body.performers.map((p: { name: string }) => p.name)).toEqual(["Alice", "Bella"]);
    expect(body.performers[0]).toMatchObject({ together: 2, videoCount: 3 });
    expect(body.performers[1]).toMatchObject({ together: 1, videoCount: 1 });
  });

  it("keeps a bucket for undated videos rather than dropping them", async () => {
    const vixen = await makeStudio("Vixen");
    await makeItem(libraryId, { title: "Undated", studioId: vixen });

    const body = (await get(`/api/studios/${vixen}`)).json();
    expect(body.years).toEqual([{ year: null, count: 1 }]);
    expect(body.videoCount).toBe(1);
  });

  it("excludes hidden videos from every aggregate", async () => {
    const vixen = await makeStudio("Vixen");
    const alice = await makePerformer("Alice");
    const hidden = await makeItem(libraryId, {
      title: "Hidden",
      studioId: vixen,
      inScope: false,
      durationSeconds: 900,
    });
    await linkPerformer(hidden, alice);

    const body = (await get(`/api/studios/${vixen}`)).json();
    expect(body).toMatchObject({ videoCount: 0, totalDurationSeconds: 0 });
    expect(body.performers).toEqual([]);
  });

  it("404s for a studio that doesn't exist", async () => {
    expect((await get("/api/studios/9999")).statusCode).toBe(404);
  });
});

describe("a studio's default category", () => {
  const patch = (id: number, body: object) =>
    app.inject({ method: "PATCH", url: `/api/studios/${id}`, headers: { cookie }, payload: body });
  const kindOf = async (id: number) =>
    (await db.select({ kind: mediaItems.kind }).from(mediaItems).where(eq(mediaItems.id, id)))[0].kind;
  const makeCategory = async (slug: string, position: number) =>
    (await db.insert(categories).values({ slug, label: slug, position }).returning())[0].id;

  it("files the studio's videos there, but not one filed by hand", async () => {
    const glamour = await makeCategory("glamour", 50);
    const studio = await makeStudio("X-Art");
    const auto = await makeItem(libraryId, { title: "Auto", studioId: studio });
    const byHand = await makeItem(libraryId, { title: "Mine", studioId: studio });
    await db.update(mediaItems).set({ kind: "movie", kindSource: "user" }).where(eq(mediaItems.id, byHand));

    const res = await patch(studio, { defaultCategoryId: glamour });
    expect(res.statusCode).toBe(200);
    expect(res.json().refiled).toBe(1);
    expect(await kindOf(auto)).toBe("glamour");
    expect(await kindOf(byHand)).toBe("movie");
    expect((await get(`/api/studios/${studio}`)).json().defaultCategoryId).toBe(glamour);
  });

  it("lets a site without one take its network's", async () => {
    const hardcore = await makeCategory("hardcore", 50);
    const network = await makeStudio("Vixen Media");
    const site = await makeStudio("Blacked");
    await patch(site, { parentId: network });
    const video = await makeItem(libraryId, { title: "Scene", studioId: site });

    await patch(network, { defaultCategoryId: hardcore });
    expect(await kindOf(video)).toBe("hardcore");
  });

  it("rejects a category that doesn't exist", async () => {
    const studio = await makeStudio("Colette");
    const res = await patch(studio, { defaultCategoryId: 999999 });
    expect(res.statusCode).toBe(400);
  });

  it("files an item into its new studio's category when you change the studio", async () => {
    const glamour = await makeCategory("glamour", 50);
    const studio = await makeStudio("X-Art");
    await patch(studio, { defaultCategoryId: glamour });
    const item = await makeItem(libraryId, { title: "Loose" });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/media-items/${item}`,
      headers: { cookie },
      payload: { studio: "X-Art" },
    });
    expect(res.statusCode).toBe(200);
    expect(await kindOf(item)).toBe("glamour");
  });
});
