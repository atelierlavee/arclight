// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { albums, mediaItems } from "../db/schema.js";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import {
  attachFile,
  makeItem,
  makeLibrary,
  makePerformer,
  makePhoto,
} from "../test/fixtures.js";

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

const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });
const patch = (url: string, payload: unknown) =>
  app.inject({ method: "PATCH", url, headers: { cookie }, payload: payload as object });

/** Builds an album directly, standing in for what the scanner produces. */
async function makeAlbum(title: string, path: string): Promise<number> {
  const [row] = await db.insert(albums).values({ path, title }).returning();
  return row.id;
}

async function addPhoto(albumId: number, name: string): Promise<number> {
  const id = await makePhoto(libraryId, name);
  await attachFile(id, rootId, `/media/album/${name}.jpg`);
  await db.update(mediaItems).set({ albumId }).where(eq(mediaItems.id, id));
  return id;
}

describe("GET /api/albums", () => {
  it("lists albums with a photo count, cover and video", async () => {
    const albumId = await makeAlbum("Mykonos", "/media/album");
    await addPhoto(albumId, "001");
    const cover = await addPhoto(albumId, "002");
    const video = await makeItem(libraryId, { title: "The scene", albumId });

    const body = (await get("/api/albums")).json();
    expect(body.albums).toHaveLength(1);
    expect(body.albums[0]).toMatchObject({ title: "Mykonos", photoCount: 2, videoItemId: video });
    // The cover is the first photo, not the video and not the last one.
    expect(body.albums[0].coverItemId).toBeLessThan(cover);
  });

  it("uses a hand-picked cover instead of the first photo", async () => {
    const albumId = await makeAlbum("Mykonos", "/media/album");
    const first = await addPhoto(albumId, "001");
    const chosen = await addPhoto(albumId, "003");

    expect((await get("/api/albums")).json().albums[0].coverItemId).toBe(first);
    expect((await patch(`/api/albums/${albumId}`, { coverItemId: chosen })).statusCode).toBe(200);
    expect((await get("/api/albums")).json().albums[0].coverItemId).toBe(chosen);

    // Cleared, and it falls back rather than losing its cover entirely.
    await patch(`/api/albums/${albumId}`, { coverItemId: null });
    expect((await get("/api/albums")).json().albums[0].coverItemId).toBe(first);
  });

  it("falls back when the chosen cover is no longer visible", async () => {
    // A cover that went out of scope would otherwise render a dead tile on
    // the albums page, with nothing to explain why.
    const albumId = await makeAlbum("Mykonos", "/media/album");
    const first = await addPhoto(albumId, "001");
    const chosen = await addPhoto(albumId, "003");
    await patch(`/api/albums/${albumId}`, { coverItemId: chosen });
    await db.update(mediaItems).set({ inScope: false }).where(eq(mediaItems.id, chosen));

    expect((await get("/api/albums")).json().albums[0].coverItemId).toBe(first);
  });

  it("refuses a cover that isn't a photo in this album", async () => {
    const albumId = await makeAlbum("Mykonos", "/media/album");
    await addPhoto(albumId, "001");
    const otherAlbum = await makeAlbum("Elsewhere", "/media/other");
    const stranger = await addPhoto(otherAlbum, "999");
    const video = await makeItem(libraryId, { title: "The scene", albumId });

    expect((await patch(`/api/albums/${albumId}`, { coverItemId: stranger })).statusCode).toBe(400);
    expect((await patch(`/api/albums/${albumId}`, { coverItemId: video })).statusCode).toBe(400);
    expect((await get(`/api/albums/${albumId}`)).json().coverItemId).toBeNull();
  });

  it("saves cover framing and clamps it", async () => {
    const albumId = await makeAlbum("Mykonos", "/media/album");
    await addPhoto(albumId, "001");

    await patch(`/api/albums/${albumId}`, {
      coverPositionX: 20,
      coverPositionY: 140,
      coverScale: 50,
    });

    const body = (await get("/api/albums")).json().albums[0];
    expect(body.coverPositionX).toBe(20);
    // Out of range is a rounding artefact, not a reason to fail a save.
    expect(body.coverPositionY).toBe(100);
    // Below 100 the photo stops covering its card.
    expect(body.coverScale).toBe(100);
  });

  it("resets framing when the cover photo changes", async () => {
    // A frame chosen against one photo crops somewhere arbitrary on another.
    const albumId = await makeAlbum("Mykonos", "/media/album");
    const first = await addPhoto(albumId, "001");
    const second = await addPhoto(albumId, "002");

    await patch(`/api/albums/${albumId}`, { coverItemId: first, coverPositionY: 10 });
    expect((await get(`/api/albums/${albumId}`)).json().coverPositionY).toBe(10);

    await patch(`/api/albums/${albumId}`, { coverItemId: second });
    expect((await get(`/api/albums/${albumId}`)).json().coverPositionY).toBe(50);
  });

  it("keeps framing sent alongside a cover change", async () => {
    // Repositioning an automatic cover pins the photo and saves the frame in
    // one request; resetting there would throw away what was just chosen.
    const albumId = await makeAlbum("Mykonos", "/media/album");
    const first = await addPhoto(albumId, "001");

    await patch(`/api/albums/${albumId}`, {
      coverItemId: first,
      coverPositionX: 30,
      coverPositionY: 70,
      coverScale: 150,
    });

    const body = (await get(`/api/albums/${albumId}`)).json();
    expect(body).toMatchObject({
      coverItemId: first,
      coverPositionX: 30,
      coverPositionY: 70,
      coverScale: 150,
    });
  });

  it("hides an album with no photos left, rather than showing an empty card", async () => {
    await makeAlbum("Empty", "/media/empty");
    expect((await get("/api/albums")).json().albums).toEqual([]);
  });

  it("does not count out-of-scope photos", async () => {
    const albumId = await makeAlbum("Partly hidden", "/media/album");
    await addPhoto(albumId, "001");
    const hidden = await addPhoto(albumId, "002");
    await db.update(mediaItems).set({ inScope: false }).where(eq(mediaItems.id, hidden));

    expect((await get("/api/albums")).json().albums[0].photoCount).toBe(1);
  });

  it("hides an album whose only photo has gone missing", async () => {
    // A row outlives its file on purpose — the scanner flags missingSince
    // rather than deleting, so an unplugged drive can't destroy metadata.
    // But a folder that exists only in the database is not browsable.
    const albumId = await makeAlbum("Ghost", "/media/ghost");
    const photo = await addPhoto(albumId, "001");
    await db
      .update(mediaItems)
      .set({ missingSince: new Date() })
      .where(eq(mediaItems.id, photo));

    // Gone from the list, which is what this test's name always claimed and
    // its body did not: missing files are excluded from every browsing
    // surface, so an album with nothing left to show has nothing to open.
    // The album row itself survives — a reconnected drive restores it on the
    // next scan.
    expect((await get("/api/albums")).json().albums).toHaveLength(0);
  });

  it("keeps an album that has lost only some of its photos", async () => {
    const albumId = await makeAlbum("Partly here", "/media/partly");
    await addPhoto(albumId, "001");
    const gone = await addPhoto(albumId, "002");
    await db
      .update(mediaItems)
      .set({ missingSince: new Date() })
      .where(eq(mediaItems.id, gone));

    const listed = (await get("/api/albums")).json().albums;
    expect(listed).toHaveLength(1);
    expect(listed[0].photoCount).toBe(1);
  });

  it("filters to one performer's albums", async () => {
    const alice = await makePerformer("Alice");
    const hers = await makeAlbum("Hers", "/media/a");
    await db.update(albums).set({ performerId: alice }).where(eq(albums.id, hers));
    await addPhoto(hers, "a1");

    const theirs = await makeAlbum("Theirs", "/media/b");
    await addPhoto(theirs, "b1");

    const body = (await get("/api/albums?performer=alice")).json();
    expect(body.albums.map((a: { title: string }) => a.title)).toEqual(["Hers"]);
  });

  it("sorts alphabetically", async () => {
    const zebra = await makeAlbum("Zebra", "/media/z");
    const apple = await makeAlbum("Apple", "/media/a");
    await addPhoto(zebra, "z1");
    await addPhoto(apple, "a1");

    const titles = (await get("/api/albums")).json().albums.map((a: { title: string }) => a.title);
    expect(titles).toEqual(["Apple", "Zebra"]);
  });
});

describe("GET /api/albums/:id", () => {
  it("returns the album, its photos and its video", async () => {
    const albumId = await makeAlbum("Mykonos", "/media/album");
    await addPhoto(albumId, "001");
    await addPhoto(albumId, "002");
    const video = await makeItem(libraryId, { title: "The scene", albumId });

    const body = (await get(`/api/albums/${albumId}`)).json();
    expect(body.title).toBe("Mykonos");
    expect(body.photos).toHaveLength(2);
    expect(body.video).toMatchObject({ id: video, title: "The scene" });
    expect(body.hasMore).toBe(false);
  });

  it("never includes the video among the photos", async () => {
    const albumId = await makeAlbum("Mykonos", "/media/album");
    await addPhoto(albumId, "001");
    await makeItem(libraryId, { title: "The scene", albumId });

    const body = (await get(`/api/albums/${albumId}`)).json();
    expect(body.photos).toHaveLength(1);
  });

  it("pages without duplicating or skipping", async () => {
    const albumId = await makeAlbum("Big", "/media/album");
    for (let i = 0; i < 105; i++) await addPhoto(albumId, String(i).padStart(3, "0"));

    const first = (await get(`/api/albums/${albumId}?page=1`)).json();
    const second = (await get(`/api/albums/${albumId}?page=2`)).json();
    expect(first.photos).toHaveLength(100);
    expect(first.hasMore).toBe(true);
    expect(second.photos).toHaveLength(5);

    const ids = [...first.photos, ...second.photos].map((p: { id: number }) => p.id);
    expect(new Set(ids).size).toBe(105);
  });

  it("404s for an album that does not exist", async () => {
    expect((await get("/api/albums/999999")).statusCode).toBe(404);
  });
});
