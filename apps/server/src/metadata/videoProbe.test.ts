// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { probeMetadata, probeVideo } from "./videoProbe.js";

const execFileAsync = promisify(execFile);
let directory: string;
let videoPath: string;
let silentVideoPath: string;

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "arclight-probe-test-"));
  videoPath = path.join(directory, "with-audio.mkv");
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=320x240:rate=24",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=1000:sample_rate=48000",
    "-t",
    "1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-y",
    videoPath,
  ]);
  silentVideoPath = path.join(directory, "without-audio.mp4");
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=320x240:rate=24",
    "-t",
    "1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-y",
    silentVideoPath,
  ]);
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("videoProbe", () => {
  it("records the first audio codec alongside the video codec", async () => {
    const probe = await probeVideo(videoPath);
    expect(probe.codec).toBe("h264");
    expect(probe.audioCodec).toBe("aac");
    expect(probeMetadata(probe).audioCodec).toBe("aac");
  });

  it("distinguishes a silent video from missing audio metadata", async () => {
    const probe = await probeVideo(silentVideoPath);
    expect(probe.audioCodec).toBe("none");
  });
});
