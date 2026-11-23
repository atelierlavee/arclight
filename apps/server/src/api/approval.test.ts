// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import { linkPerformer, makeItem, makeLibrary, makePerformer, makePhoto } from "../test/fixtures.js";

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
const post = (url: string, payload?: unknown) =>
  app.inject({ method: "POST", url, headers: { cookie }, payload: payload as object });

const titles = async (url: string): Promise<string[]> =>
  ((await get(url)).json() as { items: { title: string }[] }).items.map((i) => i.title);

describe("videos awaiting approval", () => {
  it("stay out of the library, but are in the inbox", async () => {
    await makeItem(libraryId, { title: "Approved" });
    await makeItem(libraryId, { title: "Waiting", triagedAt: null });

    expect(await titles("/api/media-items")).toEqual(["Approved"]);
    expect(await titles("/api/inbox")).toEqual(["Waiting"]);
  });

  it("stay out of search and a performer's video count", async () => {
    const performer = await makePerformer("Ann");
    const waiting = await makeItem(libraryId, { title: "Waiting Scene", triagedAt: null });
    const approved = await makeItem(libraryId, { title: "Approved Scene" });
    await linkPerformer(waiting, performer);
    await linkPerformer(approved, performer);

    // The approved one is found, so an empty result for the other is the gate
    // and not a search that matches nothing.
    expect(await titles("/api/media-items?q=Scene")).toEqual(["Approved Scene"]);
    const body = (await get("/api/performers")).json() as { performers: { videoCount: number }[] };
    expect(body.performers[0].videoCount).toBe(1);
  });

  it("appear in the library once approved from the inbox", async () => {
    const id = await makeItem(libraryId, { title: "Waiting", triagedAt: null });
    expect(await titles("/api/media-items")).toEqual([]);

    expect((await post("/api/inbox/triage", { ids: [id] })).statusCode).toBe(200);

    expect(await titles("/api/media-items")).toEqual(["Waiting"]);
    expect(await titles("/api/inbox")).toEqual([]);
  });

  it("all appear after Mark all done", async () => {
    await makeItem(libraryId, { title: "One", triagedAt: null });
    await makeItem(libraryId, { title: "Two", triagedAt: null });

    await post("/api/inbox/triage-all");

    expect((await titles("/api/media-items")).sort()).toEqual(["One", "Two"]);
  });

  it("can still be opened by id, which the inbox's edit tools rely on", async () => {
    const id = await makeItem(libraryId, { title: "Waiting", triagedAt: null });
    expect((await get(`/api/media-items/${id}`)).statusCode).toBe(200);
  });

  it("do not hold back photos, which never pass through the inbox", async () => {
    const photo = await makePhoto(libraryId, "A Photo");
    const res = await get(`/api/media-items/${photo}`);
    expect(res.statusCode).toBe(200);
    expect((await get("/api/inbox/count")).json()).toEqual({ count: 0 });
  });
});
