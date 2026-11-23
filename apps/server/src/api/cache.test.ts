// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import {
  DERIVED_DIRS,
  POSTERS_DIR,
  PERFORMER_IMAGES_DIR,
} from "../media/cache.js";

let app: FastifyInstance;
let cookie: string;

beforeAll(async () => {
  app = await testApp();
});
beforeEach(async () => {
  await resetDatabase();
  cookie = await signIn();
  for (const dir of [POSTERS_DIR, PERFORMER_IMAGES_DIR]) {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
  }
});

const get = (url: string) =>
  app.inject({ method: "GET", url, headers: { cookie } });
// Typed rather than `unknown`: fastify's inject signature narrows on the
// payload, and an `unknown` there collapses the return type to something
// with no `.json()` on it — which typechecks nowhere and runs fine, so the
// suite passed while `tsc` did not.
const post = (url: string, payload?: Record<string, unknown>) =>
  app.inject({ method: "POST", url, headers: { cookie }, payload });

describe("GET /api/library/cache", () => {
  it("splits regenerable artwork from what nothing can rebuild", async () => {
    await writeFile(path.join(POSTERS_DIR, "1-abc.jpg"), "poster-bytes");
    await writeFile(path.join(PERFORMER_IMAGES_DIR, "2-def.jpg"), "upload");

    const body = (await get("/api/library/cache")).json();
    const posters = body.entries.find(
      (entry: { name: string }) => entry.name === "posters",
    );
    const uploads = body.entries.find(
      (entry: { name: string }) => entry.name === "performer-images",
    );

    expect(posters.kind).toBe("derived");
    expect(posters.files).toBe(1);
    expect(posters.bytes).toBe("poster-bytes".length);
    expect(uploads.kind).toBe("upload");
    expect(body.derivedBytes).toBeGreaterThan(0);
    expect(body.uploadBytes).toBe("upload".length);
  });

  it("reports zero for a directory that was never created", async () => {
    await rm(POSTERS_DIR, { recursive: true, force: true });
    const body = (await get("/api/library/cache")).json();
    const posters = body.entries.find(
      (entry: { name: string }) => entry.name === "posters",
    );
    expect(posters).toMatchObject({ files: 0, bytes: 0 });
  });

  it("needs a session", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/library/cache",
    });
    expect(response.statusCode).toBe(401);
  });
});

describe("POST /api/library/cache/clear", () => {
  it("removes generated artwork and reports how much went", async () => {
    await writeFile(path.join(POSTERS_DIR, "1-abc.jpg"), "x");
    await writeFile(path.join(POSTERS_DIR, "2-def.jpg"), "y");

    const body = (await post("/api/library/cache/clear", { names: ["posters"] })).json();
    expect(body.removed).toBe(2);

    const after = (await get("/api/library/cache")).json();
    expect(
      after.entries.find((entry: { name: string }) => entry.name === "posters").files,
    ).toBe(0);
  });

  // The whole safety property of this endpoint: "clear cache" must never be
  // able to reach uploaded artwork, whatever it is sent.
  it("refuses to clear an upload directory, even when asked by name", async () => {
    await writeFile(path.join(PERFORMER_IMAGES_DIR, "keep.jpg"), "irreplaceable");

    const body = (
      await post("/api/library/cache/clear", { names: ["performer-images"] })
    ).json();
    expect(body.removed).toBe(0);

    const after = (await get("/api/library/cache")).json();
    expect(
      after.entries.find(
        (entry: { name: string }) => entry.name === "performer-images",
      ).files,
    ).toBe(1);
  });

  it("ignores a name that is not a directory at all", async () => {
    const body = (
      await post("/api/library/cache/clear", { names: ["../../etc", "nonsense"] })
    ).json();
    expect(body.removed).toBe(0);
  });

  it("clears every derived directory when given no list", async () => {
    await writeFile(path.join(POSTERS_DIR, "1-abc.jpg"), "x");
    await writeFile(path.join(PERFORMER_IMAGES_DIR, "keep.jpg"), "keep");

    const body = (await post("/api/library/cache/clear")).json();
    expect(body.removed).toBe(1);

    const after = (await get("/api/library/cache")).json();
    // Uploads survive the blanket clear too.
    expect(
      after.entries.find(
        (entry: { name: string }) => entry.name === "performer-images",
      ).files,
    ).toBe(1);
  });

  it("leaves the directories in place, ready for the next scan", async () => {
    await writeFile(path.join(POSTERS_DIR, "1-abc.jpg"), "x");
    await post("/api/library/cache/clear", { names: ["posters"] });
    // Rewriting into it must not fail with ENOENT.
    await expect(
      writeFile(path.join(POSTERS_DIR, "fresh.jpg"), "y"),
    ).resolves.toBeUndefined();
  });

  it("covers every derived directory the app declares", async () => {
    // Guards against a directory being added to DERIVED_DIRS without the
    // dashboard learning about it.
    const body = (await get("/api/library/cache")).json();
    const reported = body.entries
      .filter((entry: { kind: string }) => entry.kind === "derived")
      .map((entry: { name: string }) => entry.name)
      .sort();
    expect(reported).toEqual(DERIVED_DIRS.map((d) => d.name).sort());
  });

  it("needs a session", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/library/cache/clear",
    });
    expect(response.statusCode).toBe(401);
  });
});
