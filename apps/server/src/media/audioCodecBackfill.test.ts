// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// The files these tests point at don't exist; what ffprobe would have said
// about them is decided per test.
const probeVideo = vi.hoisted(() => vi.fn());
vi.mock("../metadata/videoProbe.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../metadata/videoProbe.js")>()),
  probeVideo,
}));

import { db } from "../db/client.js";
import { mediaItems } from "../db/schema.js";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import { attachFile, makeItem, makeLibrary } from "../test/fixtures.js";
import { backfillAudioCodec, needsAudioCodec, resetAudioCodecBackfill } from "./audioCodecBackfill.js";

/** What older scans recorded: the video codec and container, no audio codec. */
const OLD_MP4 = { codec: "h264", containerFormat: "mov,mp4,m4a,3gp,3g2,mj2" };

function probeSaying(audioCodec: string) {
  return {
    durationSeconds: 1500,
    width: 1920,
    height: 1080,
    codec: "h264",
    audioCodec,
    containerFormat: "mov,mp4,m4a,3gp,3g2,mj2",
    embeddedTitle: null,
    bitrateKbps: 8000,
  };
}

const FAILED_PROBE = {
  durationSeconds: null,
  width: null,
  height: null,
  codec: null,
  audioCodec: null,
  containerFormat: null,
  embeddedTitle: null,
  bitrateKbps: null,
};

let app: FastifyInstance;
let cookie: string;

beforeAll(async () => {
  app = await testApp();
});

beforeEach(async () => {
  await resetDatabase();
  cookie = await signIn();
  probeVideo.mockReset();
  resetAudioCodecBackfill();
});

afterAll(async () => {
  await app.close();
});

async function oldVideo(name: string): Promise<number> {
  const { libraryId, rootId } = await makeLibrary();
  const id = await makeItem(libraryId, { title: name, extraMetadata: OLD_MP4 });
  await attachFile(id, rootId, `/media/${name}-${id}.mp4`);
  return id;
}

async function storedMetadata(id: number): Promise<Record<string, unknown>> {
  const [row] = await db
    .select({ extraMetadata: mediaItems.extraMetadata })
    .from(mediaItems)
    .where(eq(mediaItems.id, id));
  return row.extraMetadata as Record<string, unknown>;
}

describe("needsAudioCodec", () => {
  it("is true for a probed video with no audio codec on record", () => {
    expect(needsAudioCodec(OLD_MP4)).toBe(true);
  });

  it("is false once the audio codec is known, including a silent video", () => {
    expect(needsAudioCodec({ ...OLD_MP4, audioCodec: "aac" })).toBe(false);
    expect(needsAudioCodec({ ...OLD_MP4, audioCodec: "none" })).toBe(false);
  });

  it("leaves a never-probed video alone", () => {
    expect(needsAudioCodec(null)).toBe(false);
    expect(needsAudioCodec({})).toBe(false);
  });
});

describe("backfillAudioCodec", () => {
  it("records the audio codec ffprobe finds, keeping the rest", async () => {
    const id = await oldVideo("records");
    probeVideo.mockResolvedValue(probeSaying("aac"));

    const updated = await backfillAudioCodec(id);

    expect(updated).toEqual({ ...OLD_MP4, audioCodec: "aac" });
    expect(await storedMetadata(id)).toEqual({ ...OLD_MP4, audioCodec: "aac" });
  });

  it("leaves the record alone when the probe fails, and doesn't retry at once", async () => {
    const id = await oldVideo("fails");
    probeVideo.mockResolvedValue(FAILED_PROBE);

    expect(await backfillAudioCodec(id)).toBeNull();
    expect(await backfillAudioCodec(id)).toBeNull();

    expect(probeVideo).toHaveBeenCalledTimes(1);
    expect(await storedMetadata(id)).toEqual(OLD_MP4);
  });

  it("shares one probe between concurrent calls", async () => {
    const id = await oldVideo("shared");
    probeVideo.mockResolvedValue(probeSaying("aac"));

    await Promise.all([backfillAudioCodec(id), backfillAudioCodec(id)]);

    expect(probeVideo).toHaveBeenCalledTimes(1);
  });
});

describe("the detail route", () => {
  it("plays an older H.264 + AAC MP4 directly instead of transcoding it", async () => {
    const id = await oldVideo("plays-directly");
    probeVideo.mockResolvedValue(probeSaying("aac"));

    const response = await app.inject({
      method: "GET",
      url: `/api/media-items/${id}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().playbackWarning).toBeNull();
    expect(await storedMetadata(id)).toMatchObject({ audioCodec: "aac" });
  });

  it("still asks for transcoding when the audio really is unsupported", async () => {
    const id = await oldVideo("dts");
    probeVideo.mockResolvedValue(probeSaying("dts"));

    const response = await app.inject({
      method: "GET",
      url: `/api/media-items/${id}`,
      headers: { cookie },
    });

    expect(response.json().playbackWarning).toMatch(/dts/);
  });

  it("falls back to transcoding when the file can't be probed", async () => {
    const id = await oldVideo("offline");
    probeVideo.mockResolvedValue(FAILED_PROBE);

    const response = await app.inject({
      method: "GET",
      url: `/api/media-items/${id}`,
      headers: { cookie },
    });

    expect(response.json().playbackWarning).toMatch(/audio codec is unknown/i);
  });
});
