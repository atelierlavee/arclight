// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { execFile } from "node:child_process";
import { access, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import pLimit from "p-limit";
import { CHAPTER_FRAMES_DIR, tempPathFor } from "./cache.js";

const execFileAsync = promisify(execFile);

/**
 * Wide enough to stay sharp in a chapter tile on a high-density screen; the
 * seek bar's sprite frames are 160px and looked soft there, stretched to
 * more than twice their size.
 */
const FRAME_WIDTH = 640;

// One frame is a fraction of a second; longer means ffmpeg is stuck on a
// damaged file or a dead mount, and SIGKILL because that ignores SIGTERM.
const FRAME_TIMEOUT_MS = 30_000;

// A row of chapters asks for all its frames at once; this keeps that to a
// couple of ffmpeg processes rather than one per chapter.
const limit = pLimit(2);
const inFlight = new Map<string, Promise<string | null>>();

/** Where the frame at a whole second of a given encode is cached. */
export function chapterFramePathFor(
  mediaItemId: number,
  contentHash: string | null,
  seconds: number,
): string {
  return path.join(CHAPTER_FRAMES_DIR, `${mediaItemId}-${contentHash ?? "nohash"}-${seconds}.jpg`);
}

async function extract(videoPath: string, outputPath: string, seconds: number): Promise<string | null> {
  await mkdir(CHAPTER_FRAMES_DIR, { recursive: true });
  // Written aside and renamed, so a killed run can't leave a truncated JPEG
  // that would be served as cached from then on.
  const tempPath = tempPathFor(outputPath);
  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        // Before -i: a fast seek to the nearest keyframe, then decoded
        // forward to the exact second.
        "-ss",
        String(seconds),
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-vf",
        `scale=${FRAME_WIDTH}:-2`,
        "-q:v",
        "3",
        "-y",
        tempPath,
      ],
      { timeout: FRAME_TIMEOUT_MS, killSignal: "SIGKILL" },
    );
    await rename(tempPath, outputPath);
    return outputPath;
  } catch {
    await rm(tempPath, { force: true }).catch(() => {});
    return null;
  }
}

/**
 * A sharp still from a video at a whole second, extracted once and cached.
 *
 * Returns the file's path, or null when no frame could be read (the drive is
 * offline, the time is past the end, the file is damaged). Concurrent requests
 * for the same frame share one extraction.
 */
export async function ensureChapterFrame(
  videoPath: string,
  mediaItemId: number,
  contentHash: string | null,
  seconds: number,
): Promise<string | null> {
  const outputPath = chapterFramePathFor(mediaItemId, contentHash, seconds);
  try {
    await access(outputPath);
    return outputPath;
  } catch {
    // Not cached yet.
  }
  const pending = inFlight.get(outputPath);
  if (pending) return pending;
  const work = limit(() => extract(videoPath, outputPath, seconds)).finally(() =>
    inFlight.delete(outputPath),
  );
  inFlight.set(outputPath, work);
  return work;
}
