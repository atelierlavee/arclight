import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { profilePerformerState, profiles, studios, watchLog } from "../db/schema.js";
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
