import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import { attachFile, makeItem, makeLibraryAt } from "../test/fixtures.js";

let app: FastifyInstance;
let cookie: string;
let dir: string;
let itemId: number;
let hiddenId: number;

beforeAll(async () => {
  app = await testApp();
  dir = await mkdtemp(path.join(tmpdir(), "subs-api-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));
beforeEach(async () => {
  await resetDatabase();
  cookie = await signIn();
  const { libraryId, rootId } = await makeLibraryAt(dir);
  await writeFile(path.join(dir, "a.mp4"), "");
  await writeFile(path.join(dir, "a.en.srt"), "1\n00:00:01,000 --> 00:00:02,000\nHello\n");
  await writeFile(path.join(dir, "h.mp4"), "");
  await writeFile(path.join(dir, "h.srt"), "1\n00:00:01,000 --> 00:00:02,000\nSecret\n");
  itemId = await makeItem(libraryId, { title: "A" });
  await attachFile(itemId, rootId, path.join(dir, "a.mp4"));
  hiddenId = await makeItem(libraryId, { title: "H", hiddenAt: new Date() });
  await attachFile(hiddenId, rootId, path.join(dir, "h.mp4"));
});

const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });

describe("subtitles", () => {
  it("lists the tracks without exposing a path, and serves one as VTT", async () => {
    const list = await get(`/api/media-items/${itemId}/subtitles`);
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({ tracks: [{ index: 0, language: "en", label: "English" }] });

    const track = await get(`/api/media-items/${itemId}/subtitles/0`);
    expect(track.statusCode).toBe(200);
    expect(track.headers["content-type"]).toContain("text/vtt");
    expect(track.body).toBe("WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nHello\n");
  });

  it("answers 404 for an unknown track, a malformed index and an unknown item", async () => {
    expect((await get(`/api/media-items/${itemId}/subtitles/5`)).statusCode).toBe(404);
    expect((await get(`/api/media-items/${itemId}/subtitles/..%2Fa.en.srt`)).statusCode).toBe(404);
    expect((await get(`/api/media-items/${itemId}/subtitles/1e2`)).statusCode).toBe(404);
    expect((await get("/api/media-items/999999/subtitles")).statusCode).toBe(404);
  });

  it("treats a vault video's subtitles as hidden as the video", async () => {
    expect((await get(`/api/media-items/${hiddenId}/subtitles`)).statusCode).toBe(404);
    expect((await get(`/api/media-items/${hiddenId}/subtitles/0`)).statusCode).toBe(404);
  });
});
