import { randomBytes } from "node:crypto";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

/**
 * The root everything below lives under.
 *
 * Not named `*_DIR` on purpose: cache.test.ts treats every such export as a
 * directory that must be classified as an upload or as derived, and this is
 * the container for those rather than one of them.
 */
export const APP_DATA_ROOT = path.resolve(
  process.env.APP_DATA_DIR ?? "./app-data"
);

const appDataDir = APP_DATA_ROOT;

export const THUMBNAILS_DIR = path.resolve(appDataDir, "thumbnails");
export const POSTERS_DIR = path.resolve(appDataDir, "posters");
export const PREVIEWS_DIR = path.resolve(appDataDir, "previews");
export const SPRITES_DIR = path.resolve(appDataDir, "scrub-sprites");
export const PERFORMER_IMAGES_DIR = path.resolve(appDataDir, "performer-images");
export const ITEM_THUMBNAILS_DIR = path.resolve(appDataDir, "item-thumbnails");
export const KIND_COVERS_DIR = path.resolve(appDataDir, "kind-covers");

export type AppDataDir = { name: string; dir: string };

/**
 * Directories holding files the user supplied, which nothing can rebuild.
 *
 * This list is what the backup copies, and `name` is the folder it lands in
 * inside the archive — so a directory missing from here is a directory you
 * silently lose.
 *
 * That is not hypothetical: `kind-covers` was absent for as long as it had
 * existed. The database dump still carried `categories.cover_file`, so a
 * restore produced rows pointing at files that were never in the archive, and
 * the category tiles came back blank with no record of which image was where.
 * The list lived in three places — here, the backup, and scripts/restore.sh —
 * and only one of them knew about it.
 */
export const UPLOAD_DIRS: AppDataDir[] = [
  { name: "performer-images", dir: PERFORMER_IMAGES_DIR },
  { name: "item-thumbnails", dir: ITEM_THUMBNAILS_DIR },
  { name: "kind-covers", dir: KIND_COVERS_DIR },
];

/**
 * Artwork the app generates from the media files themselves.
 *
 * Deliberately not backed up: ffmpeg and sharp rebuild all of it on the next
 * scan, and including it takes an archive from a few megabytes to hundreds —
 * which in practice means the backup stops being run.
 */
export const DERIVED_DIRS: AppDataDir[] = [
  { name: "thumbnails", dir: THUMBNAILS_DIR },
  { name: "posters", dir: POSTERS_DIR },
  { name: "previews", dir: PREVIEWS_DIR },
  { name: "scrub-sprites", dir: SPRITES_DIR },
];

/**
 * Every directory under APP_DATA_DIR, each one classified.
 *
 * Adding a directory means adding it to `UPLOAD_DIRS` or `DERIVED_DIRS` —
 * deciding whether losing it matters. cache.test.ts fails on any `*_DIR`
 * export that appears in neither.
 */
export const APP_DATA_DIRS: AppDataDir[] = [...UPLOAD_DIRS, ...DERIVED_DIRS];

export async function ensureCacheDirs(): Promise<void> {
  // Driven off the list rather than naming each one again: this function was
  // a fourth copy that had to be kept in step with the other three.
  await Promise.all(
    APP_DATA_DIRS.map(({ dir }) => mkdir(dir, { recursive: true })),
  );
}

export type CacheUsage = {
  name: string;
  /** "upload" is persistent; "derived" is regenerable. */
  kind: "upload" | "derived";
  files: number;
  bytes: number;
};

/**
 * How much space each app-data directory is using (§17).
 *
 * Classified rather than totalled, because the whole point of the cache
 * dashboard is the distinction: clearing a derived directory costs CPU on
 * the next scan, and clearing an upload directory costs artwork nobody can
 * get back. A single "cache size" number invites exactly the wrong action.
 *
 * Walked on request rather than tracked as files are written. A counter
 * maintained alongside every poster, preview and thumbnail write is a second
 * source of truth that drifts the first time a write fails halfway, and this
 * is a settings page nobody opens in a loop.
 */
export async function cacheUsage(): Promise<CacheUsage[]> {
  return Promise.all(
    APP_DATA_DIRS.map(async (entry) => {
      const { files, bytes } = await directorySize(entry.dir);
      return {
        name: entry.name,
        kind: UPLOAD_DIRS.includes(entry) ? "upload" : "derived",
        files,
        bytes,
      } as const;
    }),
  );
}

async function directorySize(
  dir: string,
): Promise<{ files: number; bytes: number }> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    // Never created, because nothing of that kind has been generated yet.
    return { files: 0, bytes: 0 };
  }

  let files = 0;
  let bytes = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await directorySize(full);
      files += nested.files;
      bytes += nested.bytes;
    } else if (entry.isFile()) {
      try {
        bytes += (await stat(full)).size;
        files += 1;
      } catch {
        // Swept out from under us by a concurrent scan. Not counting it is
        // the correct answer a moment later anyway.
      }
    }
  }

  return { files, bytes };
}

/**
 * Deletes every generated file in the named derived directories (§17).
 *
 * Refuses anything that is not in DERIVED_DIRS, and that refusal is the
 * whole safety property: "clear cache" must never be able to reach uploaded
 * artwork, let alone an original. The caller passes names, not paths, so
 * there is no path for a traversal to travel down.
 *
 * The files come back on the next scan. Nothing here touches the database,
 * so watch state, collections and metadata are untouched by design.
 */
export async function clearDerivedCache(names: string[]): Promise<number> {
  let removed = 0;

  for (const name of names) {
    const entry = DERIVED_DIRS.find((candidate) => candidate.name === name);
    // Unknown, or an upload directory. Skipped in silence rather than
    // thrown: a client asking to clear something it may not is a bug in the
    // client, and failing the whole request would leave the directories it
    // *could* clear untouched for no reason.
    if (!entry) continue;

    const { files } = await directorySize(entry.dir);
    await rm(entry.dir, { recursive: true, force: true });
    await mkdir(entry.dir, { recursive: true });
    removed += files;
  }

  return removed;
}

export function cacheFilename(
  mediaItemId: number,
  contentHash: string | null,
  extension = "jpg"
): string {
  return `${mediaItemId}-${contentHash ?? "nohash"}.${extension}`;
}

/**
 * A sibling path to write a cache file to before renaming it into place.
 *
 * Every "is it cached?" check in this app is a plain existence test, so a
 * file written in place and cut short — ffmpeg killed by its timeout, the
 * process restarted mid-encode, a full disk — was a truncated poster or clip
 * that counted as cached forever. Writing here and renaming on success means
 * the final name only ever appears complete.
 *
 * Same directory, so the rename never crosses a filesystem. Dot-prefixed and
 * shaped unlike a cache name, so the orphan sweep leaves it alone while it is
 * being written. The real extension stays last: ffmpeg picks its output
 * format from it.
 */
export function tempPathFor(finalPath: string): string {
  const dir = path.dirname(finalPath);
  const ext = path.extname(finalPath);
  const base = path.basename(finalPath, ext);
  return path.join(dir, `.${base}.${randomBytes(6).toString("hex")}.tmp${ext}`);
}
