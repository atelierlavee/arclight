// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { execFile } from "node:child_process";
import { access, mkdtemp, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeAllTranscodeSessions,
  closeTranscodeSession,
  createTranscodeSession,
  getTranscodeSession,
  initializeTranscodeStorage,
  transcodePlaylist,
  transcodeAssetPath,
} from "./transcode.js";

const execFileAsync = promisify(execFile);
let directory: string;
let sourcePath: string;

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "arclight-transcode-test-"));
  sourcePath = path.join(directory, "source.mkv");
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
});

afterAll(async () => {
  await closeAllTranscodeSessions();
  await rm(directory, { recursive: true, force: true });
});

describe("on-demand HLS transcoding", () => {
  it("generates a requested later segment and scopes sessions to their profile", async () => {
    const profileId = 11;
    const sessionId = await createTranscodeSession(42, profileId, sourcePath, 9);

    expect(getTranscodeSession(sessionId, profileId)).toEqual({
      itemId: 42,
      sourcePath,
    });
    expect(getTranscodeSession(sessionId, profileId + 1)).toBeNull();
    expect(await transcodeAssetPath(sessionId, profileId, "segment-../../.ts")).toBeNull();

    const playlist = transcodePlaylist(sessionId, profileId);
    if (!playlist) throw new Error("The HLS playlist was not available");
    expect(playlist).toContain("#EXTM3U");
    expect(playlist).toContain("#EXT-X-DISCONTINUITY");
    expect(playlist).toContain("segment-000002.ts");

    const segmentPath = await transcodeAssetPath(
      sessionId,
      profileId,
      "segment-000002.ts",
    );
    if (!segmentPath) throw new Error("FFmpeg did not create the requested segment");
    expect((await stat(segmentPath)).size).toBeGreaterThan(0);

    await closeTranscodeSession(sessionId, profileId);
    expect(getTranscodeSession(sessionId, profileId)).toBeNull();
    await expect(access(segmentPath)).rejects.toThrow();
  });

  it("removes abandoned transcode directories after a server restart", async () => {
    const stale = await mkdtemp(path.join(tmpdir(), "arclight-transcode-stale-test-"));
    const old = new Date(Date.now() - 11 * 60 * 1000);
    await utimes(stale, old, old);

    await initializeTranscodeStorage();

    await expect(access(stale)).rejects.toThrow();
  });
});
