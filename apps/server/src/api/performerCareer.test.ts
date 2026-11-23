// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { performers } from "../db/schema.js";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import { linkPerformer, makeItem, makeLibrary, makePerformer } from "../test/fixtures.js";

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

describe("performer career", () => {
  it("lists their videos oldest release first, undated last, with their age then", async () => {
    const alice = await makePerformer("Alice");
    await db.update(performers).set({ birthdate: "1995-06-15" }).where(eq(performers.id, alice));
    const later = await makeItem(libraryId, { title: "Later", releaseDate: "2020-06-15" });
    const early = await makeItem(libraryId, { title: "Early", releaseDate: "2016-06-14" });
    const undated = await makeItem(libraryId, { title: "Undated" });
    const hidden = await makeItem(libraryId, { title: "Hidden", releaseDate: "2018-01-01", hiddenAt: new Date() });
    await makeItem(libraryId, { title: "Not hers", releaseDate: "2017-01-01" });
    for (const id of [later, early, undated, hidden]) await linkPerformer(id, alice);

    const res = await get(`/api/performers/${alice}/career`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.birthdate).toBe("1995-06-15");
    expect(body.items.map((i: { title: string; ageAtRelease: number | null }) => [i.title, i.ageAtRelease])).toEqual([
      ["Early", 20],
      ["Later", 25],
      ["Undated", null],
    ]);
  });

  it("answers 404 for an unknown performer", async () => {
    expect((await get("/api/performers/999999/career")).statusCode).toBe(404);
  });
});
