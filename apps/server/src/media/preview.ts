import { markFailed, recentlyFailed } from "./failedArtwork.js";
import { execFile } from "node:child_process";
import { access, rename, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { cacheFilename, ensureCacheDirs, PREVIEWS_DIR, tempPathFor } from "./cache.js";

const execFileAsync = promisify(execFile);

// The preview is a montage: several short segments sampled from across the
// whole file, so hovering a thumbnail conveys what the video is rather than
// what one arbitrary moment of it looks like.
const SEGMENT_COUNT = 6;
const SEGMENT_SECONDS = 2.5;

// Segments are sampled from this slice of the file. Starting part-way in
// clears intros, title cards and slow build-ups; trimming the tail keeps the
// final segment from running into credits or off the end.
const WINDOW_START_FRACTION = 0.18;
const WINDOW_END_FRACTION = 0.9;

// The widest a preview ever renders is the detail modal at 1024px; hover
// cards are roughly 470px. 1280 leaves headroom over both without paying for
// resolution nothing displays.
const PREVIEW_MAX_WIDTH = 1280;

const PREVIEW_CRF = 23;

// Both consumers hard-mute the preview (HoverPreviewCard and the modal's
// background mode), so an audio track is bytes nobody ever hears. Dropping it
// also sidesteps concat failing outright on a video with no audio stream.
const ENCODE_TIMEOUT_MS = 240_000;

/**
 * Start times for each segment of the montage, in seconds.
 *
 * Exported because the poster frame has to be the montage's *first* frame:
 * the UI layers the preview video over the still and fades it in, so any
 * mismatch between the two reads as a jump the moment you hover.
 */
export function previewSegmentOffsets(durationSeconds: number | null): number[] {
  if (!durationSeconds || durationSeconds <= 0) return [0];

  const windowStart = durationSeconds * WINDOW_START_FRACTION;
  const windowEnd = durationSeconds * WINDOW_END_FRACTION;
  const usableSeconds = windowEnd - windowStart;

  // A short video can't hold the full set — take however many whole segments
  // actually fit rather than emitting starts that overlap or run past the end.
  const count = Math.max(1, Math.min(SEGMENT_COUNT, Math.floor(usableSeconds / SEGMENT_SECONDS)));
  if (count === 1) return [round(windowStart)];

  // Anchor the last segment so it finishes inside the window, then space the
  // rest evenly back to the start.
  const lastStart = windowEnd - SEGMENT_SECONDS;
  const step = (lastStart - windowStart) / (count - 1);

  return Array.from({ length: count }, (_, i) => round(windowStart + i * step));
}

function round(seconds: number): number {
  return Number(seconds.toFixed(2));
}

export function previewPathFor(mediaItemId: number, contentHash: string | null): string {
  return path.join(PREVIEWS_DIR, cacheFilename(mediaItemId, contentHash, "mp4"));
}

function buildFfmpegArgs(videoPath: string, outputPath: string, offsets: number[]): string[] {
  const inputs: string[] = [];
  for (const offset of offsets) {
    // -ss ahead of -i seeks by keyframe without decoding up to that point,
    // which is what keeps six seeks into a multi-GB file cheap.
    inputs.push("-ss", String(offset), "-t", String(SEGMENT_SECONDS), "-i", videoPath);
  }

  // Each segment is scaled identically and given a fixed SAR — concat refuses
  // inputs whose dimensions or sample aspect ratios disagree.
  const chains = offsets
    .map((_, i) => `[${i}:v]scale='min(iw,${PREVIEW_MAX_WIDTH})':-2,setsar=1[v${i}]`)
    .join(";");
  const concatInputs = offsets.map((_, i) => `[v${i}]`).join("");
  const filterComplex = `${chains};${concatInputs}concat=n=${offsets.length}:v=1:a=0[v]`;

  return [
    ...inputs,
    "-filter_complex",
    filterComplex,
    "-map",
    "[v]",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    String(PREVIEW_CRF),
    // Puts the moov atom up front so the browser can start playing without
    // first range-requesting the end of the file.
    "-movflags",
    "+faststart",
    "-y",
    outputPath,
  ];
}

export async function generatePreviewClip(
  videoPath: string,
  mediaItemId: number,
  contentHash: string | null,
  durationSeconds: number | null
): Promise<void> {
  await ensureCacheDirs();

  const offsets = previewSegmentOffsets(durationSeconds);
  const outputPath = previewPathFor(mediaItemId, contentHash);
  // Encoded aside and renamed into place. The timeout below kills ffmpeg
  // part-way through writing, and a half-written mp4 at the final name passed
  // ensurePreviewClip's existence check — so it was "cached", unplayable, and
  // never rebuilt.
  const tempPath = tempPathFor(outputPath);

  try {
    await execFileAsync("ffmpeg", buildFfmpegArgs(videoPath, tempPath, offsets), {
      timeout: ENCODE_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
    await rename(tempPath, outputPath);
  } catch (err) {
    await rm(tempPath, { force: true }).catch(() => {});
    markFailed("preview", mediaItemId, contentHash);
    // Best-effort, exactly like posters: without a clip the UI falls back to
    // the still image rather than failing the scan. Logged rather than
    // swallowed so a systematically broken encode isn't invisible.
    console.warn(
      `preview: failed for media item ${mediaItemId}:`,
      err instanceof Error ? err.message : err
    );
  }
}

/** Encodes the preview only when one isn't already cached. */
export async function ensurePreviewClip(
  videoPath: string,
  mediaItemId: number,
  contentHash: string | null,
  durationSeconds: number | null
): Promise<void> {
  try {
    await access(previewPathFor(mediaItemId, contentHash));
    return;
  } catch {
    // not cached yet
  }
  if (recentlyFailed("preview", mediaItemId, contentHash)) return;
  await generatePreviewClip(videoPath, mediaItemId, contentHash, durationSeconds);
}
