import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { cacheFilename, ensureCacheDirs, SPRITES_DIR } from "./cache.js";

const execFileAsync = promisify(execFile);

/**
 * Seek-bar previews: one image holding a grid of small frames from across
 * the video, plus the numbers needed to find a moment's frame in it.
 *
 * Built on first request rather than at scan time. A scan already encodes a
 * poster and a montage per video, and a sprite costs a hundred seeks on top —
 * paying that for every file in a library, most of which will never be
 * scrubbed, would make every scan slower to speed up a few playbacks.
 *
 * Frames come from a hundred separate keyframe seeks, not one pass through
 * the file with a frame-rate filter. A single pass has to read every byte of
 * the video, which on a multi-gigabyte file on an external drive is most of
 * a minute; a seek reads a few hundred kilobytes wherever it lands.
 */

const MAX_FRAMES = 100;
const MIN_FRAMES = 10;
/** Roughly one frame per this many seconds, within the bounds above. */
const TARGET_INTERVAL_SECONDS = 10;
const COLUMNS = 10;
const TILE_WIDTH = 160;
/** Parallel ffmpeg seeks. Enough to hide each one's startup cost, few enough not to stall playback. */
const CONCURRENCY = 4;
const FRAME_TIMEOUT_MS = 15_000;

export type SpriteInfo = {
  /** Seconds each frame stands for: frame i covers [i × interval, (i + 1) × interval). */
  interval: number;
  count: number;
  columns: number;
  tileWidth: number;
  tileHeight: number;
};

export function spritePathFor(mediaItemId: number, contentHash: string | null): string {
  return path.join(SPRITES_DIR, cacheFilename(mediaItemId, contentHash, "jpg"));
}

function infoPathFor(mediaItemId: number, contentHash: string | null): string {
  return path.join(SPRITES_DIR, cacheFilename(mediaItemId, contentHash, "json"));
}

/** How many frames a video of this length gets, and how far apart they are. */
export function spriteLayout(durationSeconds: number): { count: number; interval: number } {
  const count = Math.max(
    MIN_FRAMES,
    Math.min(MAX_FRAMES, Math.round(durationSeconds / TARGET_INTERVAL_SECONDS)),
  );
  return { count, interval: durationSeconds / count };
}

/** More than this fraction of frames failing means the sheet isn't worth keeping. */
const MAX_FAILED_FRAME_RATIO = 0.1;

async function grabFrame(videoPath: string, seconds: number): Promise<Buffer | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffmpeg",
      [
        // Ahead of -i, so it jumps to the nearest keyframe instead of
        // decoding its way there.
        "-ss",
        seconds.toFixed(2),
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-vf",
        `scale=${TILE_WIDTH}:-2`,
        "-f",
        "image2pipe",
        "-c:v",
        "mjpeg",
        "-q:v",
        "5",
        "-",
      ],
      {
        encoding: "buffer",
        timeout: FRAME_TIMEOUT_MS,
        // SIGTERM can be ignored by a stuck ffmpeg, leaving it running.
        killSignal: "SIGKILL",
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    return stdout.length > 0 ? stdout : null;
  } catch {
    return null;
  }
}

async function generate(
  videoPath: string,
  mediaItemId: number,
  contentHash: string | null,
  durationSeconds: number,
): Promise<SpriteInfo | null> {
  await ensureCacheDirs();
  const { count, interval } = spriteLayout(durationSeconds);

  // Each frame is taken from the middle of its slot, so the first one is not
  // the black frame most videos open on.
  const frames: (Buffer | null)[] = new Array(count).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < count) {
        const index = next++;
        frames[index] = await grabFrame(videoPath, (index + 0.5) * interval);
      }
    }),
  );

  // A seek can time out while the machine is busy (during a scan, say). One
  // more try for those, one at a time, before deciding the sheet is bad.
  for (let index = 0; index < count; index++) {
    if (frames[index] === null) {
      frames[index] = await grabFrame(videoPath, (index + 0.5) * interval);
    }
  }

  // A sheet with many black cells would be cached for good and look broken
  // for as long as the file's hash stays the same. Better to build nothing
  // now and try again on the next request, when the load has passed.
  const failed = frames.filter((frame) => frame === null).length;
  if (failed > Math.floor(count * MAX_FAILED_FRAME_RATIO)) return null;

  const first = frames.find((frame): frame is Buffer => frame !== null);
  if (!first) return null;
  const { height } = await sharp(first).metadata();
  const tileHeight = height ?? Math.round((TILE_WIDTH * 9) / 16);
  const rows = Math.ceil(count / COLUMNS);

  // A frame that failed to decode is left as a black cell rather than
  // failing the whole sheet: one bad seek in a long file should not cost the
  // other ninety-nine previews.
  const composites = frames.flatMap((frame, index) =>
    frame
      ? [{
          input: frame,
          left: (index % COLUMNS) * TILE_WIDTH,
          top: Math.floor(index / COLUMNS) * tileHeight,
        }]
      : [],
  );

  const sheet = await sharp({
    create: {
      width: COLUMNS * TILE_WIDTH,
      height: rows * tileHeight,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 70 })
    .toBuffer();

  const info: SpriteInfo = { interval, count, columns: COLUMNS, tileWidth: TILE_WIDTH, tileHeight };

  // Image first, then the info file, each via a rename: the info file is
  // what marks the sprite as ready, so it must never exist beside a
  // half-written image.
  const spritePath = spritePathFor(mediaItemId, contentHash);
  const infoPath = infoPathFor(mediaItemId, contentHash);
  // Unique temp names: two builds of the same item (the in-flight map is
  // per process and per item, not per file) must not write the same path.
  const suffix = `.${randomUUID()}.tmp`;
  await writeFile(`${spritePath}${suffix}`, sheet);
  await rename(`${spritePath}${suffix}`, spritePath);
  await writeFile(`${infoPath}${suffix}`, JSON.stringify(info));
  await rename(`${infoPath}${suffix}`, infoPath);
  return info;
}

/**
 * In-flight builds, by item. Opening a video and scrubbing it straight away
 * asks twice; without this both requests would run the full set of seeks.
 */
const building = new Map<number, Promise<SpriteInfo | null>>();

/** The sprite's layout, building the sprite first if it isn't cached. */
export async function ensureScrubSprite(
  videoPath: string,
  mediaItemId: number,
  contentHash: string | null,
  durationSeconds: number,
): Promise<SpriteInfo | null> {
  try {
    return JSON.parse(await readFile(infoPathFor(mediaItemId, contentHash), "utf8")) as SpriteInfo;
  } catch {
    // Not built yet.
  }

  const pending = building.get(mediaItemId);
  if (pending) return pending;

  const job = generate(videoPath, mediaItemId, contentHash, durationSeconds)
    .catch((err: unknown) => {
      console.warn(
        `scrub sprite: failed for media item ${mediaItemId}:`,
        err instanceof Error ? err.message : err,
      );
      return null;
    })
    .finally(() => building.delete(mediaItemId));
  building.set(mediaItemId, job);
  return job;
}

export async function deleteScrubSprite(mediaItemId: number, contentHash: string | null): Promise<void> {
  await unlink(spritePathFor(mediaItemId, contentHash)).catch(() => {});
  await unlink(infoPathFor(mediaItemId, contentHash)).catch(() => {});
}
