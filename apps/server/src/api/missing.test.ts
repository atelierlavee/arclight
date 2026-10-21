import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  albums,
  collectionItems,
  collections,
  mediaFiles,
  mediaItemPerformers,
  mediaItems,
  mediaItemTags,
  playbackStates,
  tags,
} from "../db/schema.js";
import { profileSettings } from "../db/schema.js";
import { hashPassword } from "../auth/passwords.js";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import {
  attachFile,
  linkPerformer,
  makeItem,
  makeLibrary,
  makePerformer,
  makePhoto,
  ownerProfileId,
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

const gone = () => new Date("2026-01-01");

function get(url: string) {
  return app.inject({ method: "GET", url, headers: { cookie } });
}
function post(url: string, payload?: Record<string, unknown>) {
  return app.inject({ method: "POST", url, headers: { cookie }, payload });
}

async function exists(id: number): Promise<boolean> {
  const rows = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
  return rows.length > 0;
}

describe("the missing list", () => {
  it("shows a missing video with where its file used to be", async () => {
    const item = await makeItem(libraryId, { title: "Gone", missingSince: gone() });
    await attachFile(item, rootId, "/media/gone.mp4");

    const { items } = (await get("/api/missing")).json();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: item, title: "Gone", path: "/media/gone.mp4" });
  });

  // The grid renders these through MediaCard, which needs the artwork fields
  // and the type. Without them every tile falls back to a bare icon.
  it("returns what a media card needs to draw the tile", async () => {
    const item = await makeItem(libraryId, { title: "Gone", missingSince: gone() });
    await attachFile(item, rootId, "/media/gone.mp4");

    const [card] = (await get("/api/missing")).json().items;
    expect(card.itemType).toBe("video");
    expect(card).toHaveProperty("thumbnailFile");
    expect(card).toHaveProperty("durationSeconds");
    expect(card.thumbnailPositionX).toBe(50);
    expect(card.thumbnailScale).toBe(100);
  });

  it("leaves out videos that are present", async () => {
    await makeItem(libraryId, { title: "Here" });
    expect((await get("/api/missing")).json().items).toHaveLength(0);
  });

  it("leaves out missing photos, which the list is not for", async () => {
    const photo = await makePhoto(libraryId, "Gone photo");
    await db.update(mediaItems).set({ missingSince: gone() }).where(eq(mediaItems.id, photo));
    expect((await get("/api/missing")).json().items).toHaveLength(0);
  });

  it("lists a missing video whose file row has gone too", async () => {
    await makeItem(libraryId, { title: "No file", missingSince: gone() });
    const { items } = (await get("/api/missing")).json();
    expect(items).toHaveLength(1);
    expect(items[0].path).toBeNull();
  });

  it("lists a video with two files once, not twice", async () => {
    const item = await makeItem(libraryId, { title: "Two files", missingSince: gone() });
    await attachFile(item, rootId, "/media/a.mp4");
    await attachFile(item, rootId, "/media/b.mp4");
    expect((await get("/api/missing")).json().items).toHaveLength(1);
  });
});

describe("forgetting missing videos", () => {
  it("removes the item and everything pointing at it", async () => {
    const item = await makeItem(libraryId, { title: "Gone", missingSince: gone() });
    await attachFile(item, rootId, "/media/gone.mp4");
    await linkPerformer(item, await makePerformer("Someone"));
    const [tag] = await db.insert(tags).values({ name: "keep" }).returning();
    await db.insert(mediaItemTags).values({ mediaItemId: item, tagId: tag.id });
    const [collection] = await db
      .insert(collections)
      .values({ name: "Mine", type: "manual" })
      .returning();
    await db.insert(collectionItems).values({ collectionId: collection.id, mediaItemId: item });
    await db.insert(playbackStates).values({ profileId: await ownerProfileId(), mediaItemId: item, positionSeconds: 12 });

    // A foreign key violation here is the failure this whole path risks.
    const res = await post("/api/missing/forget", { ids: [item] });
    expect(res.statusCode).toBe(200);
    expect(res.json().removed).toBe(1);
    expect(await exists(item)).toBe(false);

    for (const [table, column] of [
      [mediaFiles, mediaFiles.mediaItemId],
      [mediaItemTags, mediaItemTags.mediaItemId],
      [mediaItemPerformers, mediaItemPerformers.mediaItemId],
      [collectionItems, collectionItems.mediaItemId],
      [playbackStates, playbackStates.mediaItemId],
    ] as const) {
      expect(await db.select().from(table).where(eq(column, item))).toHaveLength(0);
    }
  });

  it("refuses a video that is not missing", async () => {
    const here = await makeItem(libraryId, { title: "Here" });
    expect((await post("/api/missing/forget", { ids: [here] })).json().removed).toBe(0);
    expect(await exists(here)).toBe(true);
  });

  it("refuses a missing photo", async () => {
    const photo = await makePhoto(libraryId, "Gone photo");
    await db.update(mediaItems).set({ missingSince: gone() }).where(eq(mediaItems.id, photo));
    expect((await post("/api/missing/forget", { ids: [photo] })).json().removed).toBe(0);
    expect(await exists(photo)).toBe(true);
  });

  it("removes only the missing ones when handed a mixture", async () => {
    const missing = await makeItem(libraryId, { title: "Gone", missingSince: gone() });
    const here = await makeItem(libraryId, { title: "Here" });
    expect((await post("/api/missing/forget", { ids: [missing, here] })).json().removed).toBe(1);
    expect(await exists(missing)).toBe(false);
    expect(await exists(here)).toBe(true);
  });

  it("keeps an album that used the video as its cover", async () => {
    const item = await makeItem(libraryId, { title: "Cover", missingSince: gone() });
    const [album] = await db
      .insert(albums)
      .values({ path: "/media/an-album", title: "An album", coverItemId: item })
      .returning();

    await post("/api/missing/forget", { ids: [item] });

    const [after] = await db.select().from(albums).where(eq(albums.id, album.id));
    expect(after).toBeDefined();
    expect(after.coverItemId).toBeNull();
  });

  it("rejects a body that is not a list of ids", async () => {
    expect((await post("/api/missing/forget", { ids: "all" })).statusCode).toBe(400);
  });

  it("clears every missing video at once, leaving the present ones", async () => {
    await makeItem(libraryId, { title: "Gone 1", missingSince: gone() });
    await makeItem(libraryId, { title: "Gone 2", missingSince: gone() });
    const here = await makeItem(libraryId, { title: "Here" });

    expect((await post("/api/missing/forget-all")).json().removed).toBe(2);
    expect((await get("/api/missing")).json().items).toHaveLength(0);
    expect(await exists(here)).toBe(true);
  });
});


describe("the privacy lock", () => {
  async function setPrivacyPassword(password: string) {
    await db.insert(profileSettings).values({
      profileId: await ownerProfileId(),
      key: "privacy",
      value: { passwordHash: await hashPassword(password) },
    });
  }

  async function unlock(password: string) {
    return post("/api/privacy/unlock", { password });
  }

  it("is open when no password or passkey is set, or the owner is locked out", async () => {
    await makeItem(libraryId, { title: "Gone", missingSince: gone() });
    expect((await get("/api/missing")).statusCode).toBe(200);
  });

  it("refuses to even list once a password is set", async () => {
    await setPrivacyPassword("correct horse battery");
    const res = await get("/api/missing");
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("privacy_locked");
  });

  // The point of enforcing this server-side: a caller that skips the UI
  // entirely must still be refused.
  it("refuses to delete while locked, and deletes nothing", async () => {
    const item = await makeItem(libraryId, { title: "Gone", missingSince: gone() });
    await setPrivacyPassword("correct horse battery");

    expect((await post("/api/missing/forget", { ids: [item] })).statusCode).toBe(403);
    expect((await post("/api/missing/forget-all")).statusCode).toBe(403);
    expect(await exists(item)).toBe(true);
  });

  it("opens up once the password is proved", async () => {
    const item = await makeItem(libraryId, { title: "Gone", missingSince: gone() });
    await setPrivacyPassword("correct horse battery");

    expect((await unlock("correct horse battery")).statusCode).toBe(200);
    expect((await get("/api/missing")).statusCode).toBe(200);
    expect((await post("/api/missing/forget", { ids: [item] })).json().removed).toBe(1);
  });

  it("stays locked after a wrong password", async () => {
    await setPrivacyPassword("correct horse battery");
    expect((await unlock("wrong")).statusCode).toBe(403);
    expect((await get("/api/missing")).statusCode).toBe(403);
  });
});
