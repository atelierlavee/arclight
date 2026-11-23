// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { mediaItemTags, profilePerformerState, profiles, studios, tags, watchLog } from "../db/schema.js";
import { resetDatabase, signIn, signInOtherProfile, testApp } from "../test/harness.js";
import { linkPerformer, makeItem, makeLibrary, makePerformer, makeStudio } from "../test/fixtures.js";

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

const call = (method: "GET" | "PUT" | "POST", url: string, payload?: unknown, as = cookie) =>
  app.inject({ method, url, payload: payload as object, headers: { cookie: as } });
const following = async (as = cookie) =>
  (await call("GET", "/api/media-items?following=true", undefined, as))
    .json()
    .items.map((i: { title: string }) => i.title)
    .sort();

describe("following", () => {
  it("lists videos from a followed performer, and stops when unfollowed", async () => {
    const alice = await makePerformer("Alice");
    const withAlice = await makeItem(libraryId, { title: "With Alice" });
    await makeItem(libraryId, { title: "Without" });
    await linkPerformer(withAlice, alice);

    const res = await call("PUT", `/api/performers/${alice}/follow`, { follow: true });
    expect(res.statusCode).toBe(200);
    expect(res.json().followedAt).toBeTruthy();
    expect((await call("GET", `/api/performers/${alice}`)).json().followedAt).toBeTruthy();
    expect(await following()).toEqual(["With Alice"]);

    await call("PUT", `/api/performers/${alice}/follow`, { follow: false });
    expect(await following()).toEqual([]);
  });

  it("takes in every site under a followed network", async () => {
    const network = await makeStudio("Network");
    const site = await makeStudio("Site");
    await db.update(studios).set({ parentId: network }).where(eq(studios.id, site));
    await makeItem(libraryId, { title: "On the site", studioId: site });
    await makeItem(libraryId, { title: "Elsewhere", studioId: await makeStudio("Other") });

    await call("PUT", `/api/studios/${network}/follow`, { follow: true });
    expect((await call("GET", `/api/studios/${network}`)).json().followedAt).toBeTruthy();
    expect(await following()).toEqual(["On the site"]);
  });

  it("counts new unwatched arrivals for the bell", async () => {
    const studio = await makeStudio("Studio");
    const fresh = await makeItem(libraryId, { title: "Fresh", studioId: studio });
    await makeItem(libraryId, { title: "Old", studioId: studio, createdAt: new Date("2020-01-01") });
    await makeItem(libraryId, { title: "Waiting", studioId: studio, triagedAt: null });
    await call("PUT", `/api/studios/${studio}/follow`, { follow: true });

    let summary = (await call("GET", "/api/following/summary")).json();
    expect(summary.newCount).toBe(1);
    expect(summary.newestAt).toBeTruthy();

    await call("PUT", `/api/media-items/${fresh}/watched`, { watched: true });
    summary = (await call("GET", "/api/following/summary")).json();
    expect(summary.newCount).toBe(0);
  });

  it("is per profile", async () => {
    const studio = await makeStudio("Studio");
    await makeItem(libraryId, { title: "Theirs", studioId: studio });
    const guest = await signInOtherProfile();
    await call("PUT", `/api/studios/${studio}/follow`, { follow: true }, guest.cookie);
    expect(await following(guest.cookie)).toEqual(["Theirs"]);
    expect(await following()).toEqual([]);
  });

  it("refuses bad bodies and unknown ids", async () => {
    const alice = await makePerformer("Alice");
    expect((await call("PUT", `/api/performers/${alice}/follow`, { follow: "yes" })).statusCode).toBe(400);
    expect((await call("PUT", "/api/performers/999999/follow", { follow: true })).statusCode).toBe(404);
    expect((await call("PUT", "/api/studios/999999/follow", { follow: true })).statusCode).toBe(404);
  });

  it("lists who is followed with their counts, a network's sites included", async () => {
    const alice = await makePerformer("Alice");
    const network = await makeStudio("Network");
    const site = await makeStudio("Site");
    await db.update(studios).set({ parentId: network }).where(eq(studios.id, site));
    const fresh = await makeItem(libraryId, { title: "Fresh", studioId: site });
    await makeItem(libraryId, { title: "Old", studioId: site, createdAt: new Date("2020-01-01") });
    await linkPerformer(fresh, alice);
    await call("PUT", `/api/performers/${alice}/follow`, { follow: true });
    await call("PUT", `/api/studios/${network}/follow`, { follow: true });

    const body = (await call("GET", "/api/following")).json();
    expect(body.performers).toHaveLength(1);
    expect(body.performers[0]).toMatchObject({ id: alice, name: "Alice", videoCount: 1, newCount: 1 });
    expect(body.studios).toHaveLength(1);
    expect(body.studios[0]).toMatchObject({ id: network, videoCount: 2, newCount: 1 });

    const performerList = (await call("GET", "/api/performers")).json().performers;
    expect(performerList.find((p: { id: number }) => p.id === alice).isFollowed).toBe(true);
    const studioList = (await call("GET", "/api/studios")).json().studios;
    expect(studioList.find((s: { id: number }) => s.id === network).isFollowed).toBe(true);
  });

  it("suggests who this profile watches but does not follow, with the reasons", async () => {
    const watched = await makePerformer("Watched");
    const ignored = await makePerformer("Ignored");
    const studio = await makeStudio("Studio");
    const a = await makeItem(libraryId, { title: "A", studioId: studio });
    const b = await makeItem(libraryId, { title: "B" });
    await linkPerformer(a, watched);
    await linkPerformer(b, ignored);
    await call("PUT", `/api/media-items/${a}/watched`, { watched: true });
    await call("POST", `/api/media-items/${a}/o`);

    let body = (await call("GET", "/api/following/suggestions")).json();
    expect(body.performers.map((p: { name: string }) => p.name)).toEqual(["Watched"]);
    expect(body.performers[0]).toMatchObject({ plays: 1, oCount: 1 });
    expect(body.studios.map((s: { name: string }) => s.name)).toEqual(["Studio"]);

    await call("PUT", `/api/performers/${watched}/follow`, { follow: true });
    await call("PUT", `/api/studios/${studio}/follow`, { follow: true });
    body = (await call("GET", "/api/following/suggestions")).json();
    expect(body.performers).toEqual([]);
    expect(body.studios).toEqual([]);

    const guest = await signInOtherProfile();
    const theirs = (await call("GET", "/api/following/suggestions", undefined, guest.cookie)).json();
    expect(theirs.performers).toEqual([]);
  });
});

describe("following stats", () => {
  const hoursAgo = (hours: number) => {
    const date = new Date(Date.now() - hours * 3600 * 1000);
    date.setUTCMinutes(0, 0, 0);
    return date;
  };

  it("measures the share, ranks this month, and finds who has gone quiet", async () => {
    const [{ id: profile }] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.isOwner, true));
    const alice = await makePerformer("Alice");
    const quiet = await makePerformer("Quiet");
    const fresh = await makePerformer("Fresh");
    const aliceVideo = await makeItem(libraryId, { title: "Alice's" });
    const quietVideo = await makeItem(libraryId, { title: "Quiet's" });
    const other = await makeItem(libraryId, { title: "Unfollowed" });
    await linkPerformer(aliceVideo, alice);
    await linkPerformer(quietVideo, quiet);

    for (const id of [alice, quiet, fresh]) {
      await call("PUT", `/api/performers/${id}/follow`, { follow: true });
    }
    // Quiet was followed long ago and last watched long ago.
    await db
      .update(profilePerformerState)
      .set({ followedAt: new Date("2025-01-01") })
      .where(eq(profilePerformerState.performerId, quiet));

    await db.insert(watchLog).values([
      { profileId: profile, mediaItemId: aliceVideo, hour: hoursAgo(5), seconds: 600 },
      { profileId: profile, mediaItemId: other, hour: hoursAgo(5), seconds: 600 },
      { profileId: profile, mediaItemId: quietVideo, hour: new Date("2025-02-01T10:00:00Z"), seconds: 1200 },
    ]);

    const body = (await call("GET", "/api/following/stats")).json();
    expect(body.following).toEqual({ performers: 3, studios: 0 });
    expect(body.share).toEqual({ total: 2400, followed: 1800, recentTotal: 1200, recentFollowed: 600 });
    expect(body.top.performers).toEqual([
      expect.objectContaining({ id: alice, name: "Alice", seconds: 600 }),
    ]);
    // Fresh was only just followed, so it is not quiet yet.
    expect(body.quiet.performers.map((p: { name: string }) => p.name)).toEqual(["Quiet"]);
  });
});

describe("following feed", () => {
  type FeedItem = {
    title: string;
    watched: boolean;
    because: { performers: { id: number; name: string }[]; studio: { id: number; name: string } | null };
  };
  const feed = async (query = "", as = cookie) => {
    const res = await call("GET", `/api/following/feed${query}`, undefined, as);
    expect(res.statusCode).toBe(200);
    return res.json() as { items: FeedItem[]; hasMore: boolean; page: number };
  };

  it("lists followed videos newest release first, undated last, each with who it came from", async () => {
    const alice = await makePerformer("Alice");
    const network = await makeStudio("Network");
    const site = await makeStudio("Site");
    await db.update(studios).set({ parentId: network }).where(eq(studios.id, site));

    // Arrival order is the reverse of release order, so the test tells them apart.
    const both = await makeItem(libraryId, {
      title: "Both",
      studioId: site,
      releaseDate: "2024-05-01",
      createdAt: new Date("2026-01-01"),
    });
    await linkPerformer(both, alice);
    const solo = await makeItem(libraryId, {
      title: "Alice only",
      releaseDate: "2020-01-01",
      createdAt: new Date("2026-02-01"),
    });
    await linkPerformer(solo, alice);
    // Undated, and the newest arrival of all: still last.
    await makeItem(libraryId, { title: "Site only", studioId: site, createdAt: new Date("2026-03-01") });
    await makeItem(libraryId, { title: "Unfollowed", studioId: await makeStudio("Other") });
    const waiting = await makeItem(libraryId, { title: "Waiting", triagedAt: null });
    await linkPerformer(waiting, alice);

    await call("PUT", `/api/performers/${alice}/follow`, { follow: true });
    await call("PUT", `/api/studios/${network}/follow`, { follow: true });

    const { items, hasMore } = await feed();
    expect(items.map((i) => i.title)).toEqual(["Both", "Alice only", "Site only"]);
    expect(hasMore).toBe(false);
    expect(items[0].because).toEqual({
      performers: [{ id: alice, name: "Alice", hasImage: false, hasBanner: false }],
      studio: { id: network, name: "Network" },
    });
    expect(items[1].because).toEqual({ performers: [{ id: alice, name: "Alice", hasImage: false, hasBanner: false }], studio: null });
    expect(items[2].because).toEqual({ performers: [], studio: { id: network, name: "Network" } });

    // A site followed in its own right is named over its network.
    await call("PUT", `/api/studios/${site}/follow`, { follow: true });
    expect((await feed()).items[2].because.studio).toEqual({ id: site, name: "Site" });
  });

  it("can leave out what has been watched", async () => {
    const studio = await makeStudio("Studio");
    const seen = await makeItem(libraryId, { title: "Seen", studioId: studio });
    await makeItem(libraryId, { title: "Unseen", studioId: studio });
    await call("PUT", `/api/studios/${studio}/follow`, { follow: true });
    await call("PUT", `/api/media-items/${seen}/watched`, { watched: true });

    expect((await feed()).items.map((i) => [i.title, i.watched]).sort()).toEqual([
      ["Seen", true],
      ["Unseen", false],
    ]);
    expect((await feed("?unwatched=true")).items.map((i) => i.title)).toEqual(["Unseen"]);
  });

  it("is per profile, and refuses a bad page", async () => {
    const studio = await makeStudio("Studio");
    await makeItem(libraryId, { title: "Theirs", studioId: studio });
    const guest = await signInOtherProfile();
    await call("PUT", `/api/studios/${studio}/follow`, { follow: true }, guest.cookie);
    expect((await feed("", guest.cookie)).items.map((i) => i.title)).toEqual(["Theirs"]);
    expect((await feed()).items).toEqual([]);
    expect((await call("GET", "/api/following/feed?page=0")).statusCode).toBe(400);
  });
});

describe("following trending tags", () => {
  it("counts tags on recent videos from who is followed, falling back to all of them", async () => {
    const studio = await makeStudio("Studio");
    const tag = async (name: string) =>
      (await db.insert(tags).values({ name }).returning({ id: tags.id }))[0].id;
    const outdoor = await tag("Outdoor");
    const pov = await tag("POV");
    const elsewhere = await tag("Elsewhere");

    const old = await makeItem(libraryId, { studioId: studio, createdAt: new Date("2020-01-01") });
    await db.insert(mediaItemTags).values({ mediaItemId: old, tagId: pov });
    const unfollowed = await makeItem(libraryId, { studioId: await makeStudio("Other") });
    await db.insert(mediaItemTags).values({ mediaItemId: unfollowed, tagId: elsewhere });
    await call("PUT", `/api/studios/${studio}/follow`, { follow: true });

    // Nothing recent yet: all their videos count.
    let body = (await call("GET", "/api/following/tags")).json();
    expect(body.recent).toBe(false);
    expect(body.tags).toEqual([{ id: pov, name: "POV", count: 1 }]);

    for (let i = 0; i < 2; i++) {
      const fresh = await makeItem(libraryId, { studioId: studio });
      await db.insert(mediaItemTags).values({ mediaItemId: fresh, tagId: outdoor });
    }
    body = (await call("GET", "/api/following/tags")).json();
    expect(body.recent).toBe(true);
    expect(body.tags).toEqual([{ id: outdoor, name: "Outdoor", count: 2 }]);
  });
});

describe("following feed extras", () => {
  const titles = async (url: string) =>
    ((await call("GET", url)).json().items as { title: string }[]).map((i) => i.title);

  it("narrows to one performer or one studio's sites, and can order by arrival", async () => {
    const alice = await makePerformer("Alice");
    const network = await makeStudio("Network");
    const site = await makeStudio("Site");
    await db.update(studios).set({ parentId: network }).where(eq(studios.id, site));
    const withAlice = await makeItem(libraryId, {
      title: "With Alice",
      releaseDate: "2024-01-01",
      createdAt: new Date("2026-01-01"),
    });
    await linkPerformer(withAlice, alice);
    await makeItem(libraryId, {
      title: "On the site",
      studioId: site,
      releaseDate: "2020-01-01",
      createdAt: new Date("2026-02-01"),
    });
    await call("PUT", `/api/performers/${alice}/follow`, { follow: true });
    await call("PUT", `/api/studios/${network}/follow`, { follow: true });

    expect(await titles(`/api/following/feed?performer=${alice}`)).toEqual(["With Alice"]);
    expect(await titles(`/api/following/feed?studio=${network}`)).toEqual(["On the site"]);
    expect(await titles("/api/following/feed")).toEqual(["With Alice", "On the site"]);
    expect(await titles("/api/following/feed?order=added")).toEqual(["On the site", "With Alice"]);
    expect((await call("GET", "/api/following/feed?performer=abc")).statusCode).toBe(400);
  });

  it("carries this profile's note", async () => {
    const studio = await makeStudio("Studio");
    const id = await makeItem(libraryId, { title: "Noted", studioId: studio });
    await call("PUT", `/api/studios/${studio}/follow`, { follow: true });
    await call("PUT", `/api/media-items/${id}/note`, { note: "Great one" });
    expect((await call("GET", "/api/following/feed")).json().items[0].note).toBe("Great one");
  });

  it("lists what is still waiting in the inbox from who is followed", async () => {
    const studio = await makeStudio("Studio");
    await makeItem(libraryId, { title: "Waiting", studioId: studio, triagedAt: null });
    await makeItem(libraryId, { title: "Approved", studioId: studio });
    await makeItem(libraryId, { title: "Someone else's", triagedAt: null });
    await call("PUT", `/api/studios/${studio}/follow`, { follow: true });
    const body = (await call("GET", "/api/following/upcoming")).json();
    expect(body.count).toBe(1);
    expect(body.items.map((i: { title: string }) => i.title)).toEqual(["Waiting"]);
  });
});
