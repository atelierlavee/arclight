import { access, rename, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { cacheFilename, ensureCacheDirs, POSTERS_DIR, tempPathFor, THUMBNAILS_DIR } from "./cache.js";

// Album covers and photo grids render these several hundred pixels wide on a
// full-width page, so 320 was being upscaled and looked soft. The width is
// part of the cache filename below, so changing this number regenerates
// rather than silently serving the old size forever.
const THUMBNAIL_WIDTH = 800;

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** For photos: generate a resized JPEG on first request, then reuse the cached file. */
export async function getOrCreatePhotoThumbnail(
  sourcePath: string,
  mediaItemId: number,
  contentHash: string | null
): Promise<string | null> {
  await ensureCacheDirs();
  const cachePath = path.join(
    THUMBNAILS_DIR,
    `w${THUMBNAIL_WIDTH}-${cacheFilename(mediaItemId, contentHash)}`
  );

  if (await exists(cachePath)) {
    return cachePath;
  }

  // Aside and renamed, for the same reason as posters: the cache check above
  // is an existence test, so a half-written file would be served forever.
  const tempPath = tempPathFor(cachePath);
  try {
    await sharp(sourcePath)
      // withoutEnlargement: a photo smaller than the target should stay its
      // own size rather than being blown up into a blurry copy.
      .resize(THUMBNAIL_WIDTH, undefined, { withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toFile(tempPath);
    await rename(tempPath, cachePath);
    return cachePath;
  } catch {
    await rm(tempPath, { force: true }).catch(() => {});
    // Covers unsupported formats (e.g. HEIC without libheif support) — the
    // caller falls back to a generic icon rather than erroring out.
    return null;
  }
}

/** For videos: the poster frame is generated eagerly at scan time (see poster.ts); this just looks it up. */
export async function getPosterPath(
  mediaItemId: number,
  contentHash: string | null
): Promise<string | null> {
  const posterPath = path.join(POSTERS_DIR, cacheFilename(mediaItemId, contentHash));
  return (await exists(posterPath)) ? posterPath : null;
}
