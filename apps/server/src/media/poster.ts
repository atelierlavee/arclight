import { execFile } from "node:child_process";
import { access, rename, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { cacheFilename, ensureCacheDirs, POSTERS_DIR, tempPathFor } from "./cache.js";
import { previewSegmentOffsets } from "./preview.js";

const execFileAsync = promisify(execFile);

// One frame is a fraction of a second of work. A file that takes longer than
// this is one ffmpeg is stuck on — a damaged container, a network mount that
// stopped answering — and without a limit it held a scan slot forever.
// SIGKILL because a wedged ffmpeg reading from a dead mount ignores SIGTERM.
const POSTER_TIMEOUT_MS = 60_000;

// The poster is deliberately the first frame of the preview montage, not an
// independently chosen frame. Both HoverPreviewCard and the detail modal
// layer the clip over this still and fade it in, so if the two disagree the
// hand-off shows up as a visible jump the instant you hover.
function posterOffsetSeconds(durationSeconds: number | null): number {
  return previewSegmentOffsets(durationSeconds)[0];
}

export function posterPathFor(mediaItemId: number, contentHash: string | null): string {
  return path.join(POSTERS_DIR, cacheFilename(mediaItemId, contentHash));
}

export async function generatePosterFrame(
  videoPath: string,
  mediaItemId: number,
  contentHash: string | null,
  durationSeconds: number | null
): Promise<void> {
  await ensureCacheDirs();

  const offset = posterOffsetSeconds(durationSeconds);
  const outputPath = posterPathFor(mediaItemId, contentHash);
  // Written aside and renamed, so a killed run can't leave a truncated JPEG
  // that ensurePosterFrame would treat as cached from then on.
  const tempPath = tempPathFor(outputPath);

  try {
    await execFileAsync(
      "ffmpeg",
      ["-ss", String(offset), "-i", videoPath, "-frames:v", "1", "-y", tempPath],
      { timeout: POSTER_TIMEOUT_MS, killSignal: "SIGKILL" },
    );
    await rename(tempPath, outputPath);
  } catch {
    // Poster generation is best-effort: a missing poster just falls back to
    // the generic icon in the UI, it never fails the scan itself.
    await rm(tempPath, { force: true }).catch(() => {});
  }
}

/**
 * Generates the poster only when one isn't already cached. Called for every
 * video on every scan, so deleting the posters directory is enough to have
 * them all rebuilt on the next scan.
 */
export async function ensurePosterFrame(
  videoPath: string,
  mediaItemId: number,
  contentHash: string | null,
  durationSeconds: number | null
): Promise<void> {
  try {
    await access(posterPathFor(mediaItemId, contentHash));
    return; // already cached
  } catch {
    // not there yet — fall through and build it
  }
  await generatePosterFrame(videoPath, mediaItemId, contentHash, durationSeconds);
}
