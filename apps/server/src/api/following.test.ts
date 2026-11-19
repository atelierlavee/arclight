import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { studios } from "../db/schema.js";
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

const call = (method: "GET" | "PUT", url: string, payload?: unknown, as = cookie) =>
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
});
