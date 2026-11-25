// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, signIn, signInOtherProfile, testApp } from "../test/harness.js";
import { attachFile, makeItem, makeLibraryAt } from "../test/fixtures.js";
import { closeAllTranscodeSessions } from "../media/transcode.js";

const execFileAsync = promisify(execFile);
let app: FastifyInstance;
let cookie: string;
let directory: string;

beforeAll(async () => {
  app = await testApp();
});

beforeEach(async () => {
  await resetDatabase();
  cookie = await signIn();
  directory = await mkdtemp(path.join(tmpdir(), "arclight-transcode-api-"));
});

afterEach(async () => {
  await closeAllTranscodeSessions();
  await rm(directory, { recursive: true, force: true });
});

afterAll(async () => {
  await app.close();
});

describe("on-demand transcode routes", () => {
  it("serves generated HLS only to the profile that started it", async () => {
    const { libraryId, rootId } = await makeLibraryAt(directory);
    const sourcePath = path.join(directory, "unsupported.mkv");
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=320x240:rate=24",
      "-t",
      "9",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-y",
      sourcePath,
    ]);
    const itemId = await makeItem(libraryId, {
      title: "Unsupported container",
      extraMetadata: {
        codec: "h264",
        audioCodec: "aac",
        containerFormat: "matroska,webm",
      },
    });
    await attachFile(itemId, rootId, sourcePath);

    const created = await app.inject({
      method: "POST",
      url: `/api/media-items/${itemId}/transcodes`,
      headers: { cookie },
    });
    expect(created.statusCode).toBe(201);
    const { sessionId } = created.json() as { sessionId: string };

    const otherProfile = await signInOtherProfile();
    const privateResponse = await app.inject({
      method: "GET",
      url: `/api/transcodes/${sessionId}/index.m3u8`,
      headers: { cookie: otherProfile.cookie },
    });
    expect(privateResponse.statusCode).toBe(404);

    const playlistResponse = await app.inject({
      method: "GET",
      url: `/api/transcodes/${sessionId}/index.m3u8`,
      headers: { cookie },
    });
    expect(playlistResponse.statusCode).toBe(200);
    expect(playlistResponse.body).toContain("#EXTM3U");

    const segment = "segment-000002.ts";
    expect(playlistResponse.body).toContain(segment);
    const segmentResponse = await app.inject({
      method: "GET",
      url: `/api/transcodes/${sessionId}/${segment}`,
      headers: { cookie },
    });
    expect(segmentResponse.statusCode).toBe(200);
    expect(segmentResponse.headers["content-type"]).toContain("video/mp2t");

    const stopped = await app.inject({
      method: "DELETE",
      url: `/api/transcodes/${sessionId}`,
      headers: { cookie },
    });
    expect(stopped.statusCode).toBe(204);
  });

  it("does not start a transcode for a browser-compatible video", async () => {
    const { libraryId, rootId } = await makeLibraryAt(directory);
    const sourcePath = path.join(directory, "compatible.mp4");
    await writeFile(sourcePath, "test bytes");
    const itemId = await makeItem(libraryId, {
      title: "Direct play",
      extraMetadata: {
        codec: "h264",
        audioCodec: "aac",
        containerFormat: "mov,mp4,m4a,3gp,3g2,mj2",
      },
    });
    await attachFile(itemId, rootId, sourcePath);

    const response = await app.inject({
      method: "POST",
      url: `/api/media-items/${itemId}/transcodes`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(409);
  });
});
