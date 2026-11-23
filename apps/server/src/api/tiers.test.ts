// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, signIn, signInOtherProfile, testApp } from "../test/harness.js";
import { linkPerformer, makeItem, makeLibrary, makePerformer } from "../test/fixtures.js";
import { parseBoard } from "./tiers.js";

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
const board = async (kind: string, as = cookie) => (await call("GET", `/api/tiers/${kind}`, undefined, as)).json();
const names = (rows: { name?: string; title?: string }[]) => rows.map((row) => row.name ?? row.title);

describe("parseBoard", () => {
  it("accepts a board and rejects unknown tiers, bad ids and repeats", () => {
    expect(parseBoard({ S: [1, 2], A: [3] })).toEqual({ ok: true, board: { S: [1, 2], A: [3], B: [], C: [], D: [] } });
    expect(parseBoard({ X: [1] }).ok).toBe(false);
    expect(parseBoard({ S: [1.5] }).ok).toBe(false);
    expect(parseBoard({ S: [1], A: [1] }).ok).toBe(false);
    expect(parseBoard([]).ok).toBe(false);
  });
});

describe("performer tiers", () => {
  it("ranks, reorders and unranks, with the rest in the pool", async () => {
    const ids: Record<string, number> = {};
    for (const name of ["Alice", "Bella", "Cara", "Dana"]) {
      ids[name] = await makePerformer(name);
      await linkPerformer(await makeItem(libraryId, { title: `${name}'s` }), ids[name]);
    }
    await makePerformer("No videos");

    let body = await board("performer");
    expect(body.tiers).toEqual(["S", "A", "B", "C", "D"]);
    expect(body.ranked).toEqual([]);
    expect(names(body.pool)).toEqual(["Alice", "Bella", "Cara", "Dana"]);

    expect(
      (await call("PUT", "/api/tiers/performer", { tiers: { S: [ids.Bella, ids.Alice], B: [ids.Cara] } })).statusCode,
    ).toBe(200);
    body = await board("performer");
    expect(body.ranked.map((row: { name: string; tier: string }) => [row.name, row.tier])).toEqual([
      ["Cara", "B"],
      ["Bella", "S"],
      ["Alice", "S"],
    ]);
    expect(names(body.pool)).toEqual(["Dana"]);

    // Leaving Cara out of the next save unranks her.
    await call("PUT", "/api/tiers/performer", { tiers: { S: [ids.Alice], A: [ids.Bella] } });
    body = await board("performer");
    expect(names(body.pool)).toEqual(["Cara", "Dana"]);
  });

  it("is per profile", async () => {
    const alice = await makePerformer("Alice");
    await linkPerformer(await makeItem(libraryId), alice);
    const guest = await signInOtherProfile();
    await call("PUT", "/api/tiers/performer", { tiers: { S: [alice] } }, guest.cookie);
    expect((await board("performer", guest.cookie)).ranked).toHaveLength(1);
    expect((await board("performer")).ranked).toHaveLength(0);
  });
});

describe("video tiers", () => {
  it("pools what the profile has a view on, and drops unknown or vault ids on save", async () => {
    const watched = await makeItem(libraryId, { title: "Watched" });
    const favourite = await makeItem(libraryId, { title: "Favourite", isFavorite: true });
    await makeItem(libraryId, { title: "Untouched" });
    const hidden = await makeItem(libraryId, { title: "Hidden", hiddenAt: new Date(), rating: 5 });
    await call("PUT", `/api/media-items/${watched}/watched`, { watched: true });

    let body = await board("video");
    expect(names(body.pool).sort()).toEqual(["Favourite", "Watched"]);

    const res = await call("PUT", "/api/tiers/video", { tiers: { S: [watched, hidden, 999999], A: [favourite] } });
    expect(res.json().ranked).toBe(2);
    body = await board("video");
    expect(body.ranked.map((row: { title: string; tier: string }) => [row.title, row.tier]).sort()).toEqual([
      ["Favourite", "A"],
      ["Watched", "S"],
    ]);
    expect(body.pool).toEqual([]);
  });

  it("refuses an unknown kind and a bad board", async () => {
    expect((await call("GET", "/api/tiers/studio")).statusCode).toBe(404);
    expect((await call("PUT", "/api/tiers/video", { tiers: { Z: [1] } })).statusCode).toBe(400);
  });
});
