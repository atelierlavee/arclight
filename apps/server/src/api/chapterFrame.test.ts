// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import { attachFile, makeItem, makeLibrary } from "../test/fixtures.js";

let app: FastifyInstance;
let cookie: string;

beforeAll(async () => {
  app = await testApp();
});

beforeEach(async () => {
  await resetDatabase();
  cookie = await signIn();
});

afterAll(async () => {
  await app.close();
});

async function frame(url: string) {
  return app.inject({ method: "GET", url, headers: { cookie } });
}

describe("GET /api/media-items/:id/frame.jpg", () => {
  it("wants a whole, non-negative number of seconds", async () => {
    const { libraryId, rootId } = await makeLibrary();
    const id = await makeItem(libraryId, { durationSeconds: 600 });
    await attachFile(id, rootId, `/media/frame-${id}.mp4`);

    for (const t of ["", "abc", "-5", "12.5"]) {
      const response = await frame(`/api/media-items/${id}/frame.jpg?t=${t}`);
      expect(response.statusCode, `t=${t}`).toBe(400);
    }
  });

  it("refuses a time past the end of the video", async () => {
    const { libraryId, rootId } = await makeLibrary();
    const id = await makeItem(libraryId, { durationSeconds: 600 });
    await attachFile(id, rootId, `/media/frame-${id}.mp4`);

    const response = await frame(`/api/media-items/${id}/frame.jpg?t=601`);
    expect(response.statusCode).toBe(400);
  });

  it("answers 404 for an item that doesn't exist", async () => {
    const response = await frame(`/api/media-items/999999/frame.jpg?t=10`);
    expect(response.statusCode).toBe(404);
  });

  it("answers 404 when no frame can be read from the file", async () => {
    const { libraryId, rootId } = await makeLibrary();
    const id = await makeItem(libraryId, { durationSeconds: 600 });
    await attachFile(id, rootId, `/nowhere/missing-${id}.mp4`);

    const response = await frame(`/api/media-items/${id}/frame.jpg?t=10`);
    expect(response.statusCode).toBe(404);
  });
});
