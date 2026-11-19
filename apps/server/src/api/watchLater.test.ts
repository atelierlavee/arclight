import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, signIn, signInOtherProfile, testApp } from "../test/harness.js";
import { makeItem, makeLibrary } from "../test/fixtures.js";

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
const titles = (body: { items: { title: string }[] }) => body.items.map((i) => i.title);
const saved = async (as = cookie) =>
  titles((await call("GET", "/api/media-items?watchLater=true&sort=watchLater", undefined, as)).json());

describe("Watch Later", () => {
  it("saves, lists newest-saved first, and removes", async () => {
    const first = await makeItem(libraryId, { title: "First" });
    const second = await makeItem(libraryId, { title: "Second" });
    await makeItem(libraryId, { title: "Never" });

    const res = await call("PUT", `/api/media-items/${first}/watch-later`, { watchLater: true });
    expect(res.statusCode).toBe(200);
    expect(res.json().watchLaterAt).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await call("PUT", `/api/media-items/${second}/watch-later`, { watchLater: true });

    expect(await saved()).toEqual(["Second", "First"]);
    expect((await call("GET", `/api/media-items/${first}`)).json().watchLaterAt).toBeTruthy();

    await call("PUT", `/api/media-items/${first}/watch-later`, { watchLater: false });
    expect(await saved()).toEqual(["Second"]);
  });

  it("comes off the list once the video is marked watched", async () => {
    const id = await makeItem(libraryId, { title: "Finish me" });
    await call("PUT", `/api/media-items/${id}/watch-later`, { watchLater: true });
    await call("PUT", `/api/media-items/${id}/watched`, { watched: true });
    expect(await saved()).toEqual([]);
  });

  it("is per profile", async () => {
    const id = await makeItem(libraryId, { title: "Mine" });
    const guest = await signInOtherProfile();
    expect((await call("PUT", `/api/media-items/${id}/watch-later`, { watchLater: true }, guest.cookie)).statusCode).toBe(200);
    expect(await saved(guest.cookie)).toEqual(["Mine"]);
    expect(await saved()).toEqual([]);
  });

  it("refuses bad bodies, unknown items and vault items", async () => {
    const id = await makeItem(libraryId);
    const hidden = await makeItem(libraryId, { hiddenAt: new Date() });
    expect((await call("PUT", `/api/media-items/${id}/watch-later`, { watchLater: "yes" })).statusCode).toBe(400);
    expect((await call("PUT", "/api/media-items/999999/watch-later", { watchLater: true })).statusCode).toBe(404);
    expect((await call("PUT", `/api/media-items/${hidden}/watch-later`, { watchLater: true })).statusCode).toBe(404);
  });
});
