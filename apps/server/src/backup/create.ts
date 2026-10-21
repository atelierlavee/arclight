import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { UPLOAD_DIRS } from "../media/cache.js";
import { latestMigration } from "../db/journal.js";
import { logActivity } from "../activity/log.js";
import { pgChildEnv } from "./pgEnv.js";

const execFileAsync = promisify(execFile);

export const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR ?? "./backups");

// Only files matching this are ever listed, served or deleted — the name
// arrives from the client on download and delete.
export const BACKUP_NAME_PATTERN = /^media-server-[0-9TZ.-]+\.tar\.gz$/;

const DUMP_TIMEOUT_MS = 300_000;
const KEEP_BACKUPS = 10;

/**
 * The shape of meta.json. Bumped only when a restore would have to behave
 * differently, not when a field is added — an older restore ignores fields
 * it does not know, and every archive written before this existed has no
 * version at all, which is version 0.
 */
export const BACKUP_FORMAT_VERSION = 1;

/**
 * What built the archive.
 *
 * From package.json via the environment rather than imported: the server is
 * compiled to dist/, where a relative import of ../package.json resolves
 * somewhere else entirely.
 */
const APP_VERSION = process.env.APP_VERSION ?? "unknown";

export type BackupManifest = {
  backupVersion: number;
  appVersion: string;
  schemaVersion: string | null;
  createdAt: string;
  latestMigrationTag: string | null;
  latestMigrationWhen: number | null;
  components: string[];
  /** Archive-relative path to sha256, for every file in the archive. */
  checksums: Record<string, string>;
};

/**
 * sha256 of every file under a directory, keyed by relative path.
 *
 * Streamed rather than read whole: a database dump of a large library is
 * comfortably bigger than it is sensible to hold in memory, and the backup
 * runs on the same box that is serving video.
 */
export async function checksumDirectory(
  root: string,
  prefix = "",
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      Object.assign(out, await checksumDirectory(full, relative));
    } else if (entry.isFile()) {
      // meta.json is written after this runs and cannot contain its own
      // hash, so it is never a member of the map. Guarded anyway, because a
      // re-run over an unpacked archive would otherwise include it and
      // report a mismatch for a file that was never covered.
      if (relative === "meta.json") continue;
      out[relative] = await sha256File(full);
    }
  }

  return out;
}

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

// What goes in comes from media/cache.ts, which classifies every directory
// under APP_DATA_DIR as either an upload or derived artwork. It used to be
// listed again here, and the two drifted: kind-covers was declared there and
// missing here, so category covers were never backed up at all.
//
// Anything in DERIVED_DIRS is deliberately absent — ffmpeg and sharp rebuild
// it from the source videos, and including it would take an archive from a
// few megabytes to hundreds.

// Only one at a time. Reserved synchronously before the first await, the same
// way startScan reserves its slot — two near-simultaneous requests would
// otherwise both pass an `if (running)` check.
let running = false;

/** Mirrors isScanRunning() — restore has to refuse while a dump is in flight. */
export function isBackupRunning(): boolean {
  return running;
}

export type BackupFile = { name: string; sizeBytes: number; createdAt: string };

function timestamp(): string {
  return new Date().toISOString().replace(/:/g, "-");
}

/**
 * Resolves a client-supplied backup name to a path inside BACKUP_DIR, or null.
 *
 * Both the pattern and the resolved-path check matter: the pattern rejects
 * traversal outright, and re-resolving catches anything it might have missed.
 */
export function resolveBackupPath(name: string): string | null {
  if (!BACKUP_NAME_PATTERN.test(name)) return null;
  const resolved = path.resolve(BACKUP_DIR, name);
  if (path.dirname(resolved) !== BACKUP_DIR) return null;
  return resolved;
}

export async function listBackups(): Promise<BackupFile[]> {
  try {
    const entries = await readdir(BACKUP_DIR);
    const files = await Promise.all(
      entries
        .filter((name) => BACKUP_NAME_PATTERN.test(name))
        .map(async (name) => {
          const info = await stat(path.join(BACKUP_DIR, name));
          return {
            name,
            sizeBytes: info.size,
            createdAt: info.mtime.toISOString(),
          };
        }),
    );
    // Newest first — what the UI wants, and what pruning needs.
    return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    // Missing directory just means nothing has been backed up yet.
    return [];
  }
}

/**
 * Chooses which archives a new backup pushes out, given the newest-first list.
 *
 * Separated from the deleting so it can be tested without a filesystem — this
 * is the part with a decision in it, and the decision has already been wrong
 * once in a way nothing would have noticed.
 *
 * `protect` is never pruned, whatever its age. A restore takes a safety backup
 * of the current state first, and without this that extra archive pushes the
 * count past the cap and evicts the oldest — which, on a directory that has
 * been at its cap for a while, is very often the archive being restored
 * *from*. The restore works from a temp copy either way, so the deletion would
 * be completely silent: you would find out the next time you opened the list.
 *
 * Protecting the only eviction candidate leaves the directory one over the cap
 * until the next ordinary backup, which then prunes both. That is deliberate —
 * the alternative is a restore quietly deleting a *second* archive to make its
 * own room, which is more surprising than briefly keeping eleven.
 */
export function backupsToPrune(
  newestFirst: BackupFile[],
  protect?: string,
): string[] {
  return newestFirst
    .slice(KEEP_BACKUPS)
    .map((file) => file.name)
    .filter((name) => name !== protect);
}

async function pruneOldBackups(protect?: string): Promise<void> {
  for (const name of backupsToPrune(await listBackups(), protect)) {
    await rm(path.join(BACKUP_DIR, name), { force: true });
  }
}

export type CreateBackupOptions = {
  /** An archive this backup must not prune away. See pruneOldBackups. */
  protect?: string;
  /** Distinguishes an automatic pre-restore snapshot in the activity log. */
  reason?: string;
};

export async function createBackup(
  options: CreateBackupOptions = {},
): Promise<BackupFile> {
  if (running) throw new Error("A backup is already running");
  running = true;

  const name = `media-server-${timestamp()}.tar.gz`;
  const finalPath = path.join(BACKUP_DIR, name);
  // Built under a .partial name so a crash never leaves a truncated archive
  // sitting there looking restorable.
  const partialPath = `${finalPath}.partial`;
  // Inside the try, not before it: mkdtemp failing (full disk, unwritable
  // tmp) used to throw with `running` already set and nothing to clear it,
  // so every later backup — and every restore, which takes one first — was
  // refused as "already running" until the process restarted.
  let workDir: string | null = null;

  try {
    workDir = await mkdtemp(path.join(tmpdir(), "media-backup-"));
    await mkdir(BACKUP_DIR, { recursive: true });

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is not set");

    // Whole database, not --schema=public: drizzle's migration bookkeeping
    // lives in a separate `drizzle` schema, and without it the next boot
    // replays migration 0000 against tables that already exist and dies.
    // --clean/--if-exists make restoring over a populated database idempotent;
    // --no-owner/--no-privileges avoid failures if the role differs.
    //
    // Connection settings go in the environment, never argv — see pgEnv.ts.
    await execFileAsync(
      "pg_dump",
      [
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-privileges",
        "--file",
        path.join(workDir, "db.sql"),
      ],
      { timeout: DUMP_TIMEOUT_MS, env: pgChildEnv(databaseUrl) },
    );

    // Uploads are copied *after* the dump, deliberately. An upload writes its
    // file before updating the row, so a dump taken first can only reference
    // files that already exist. The reverse order could capture a row
    // pointing at a file the copy never reached — a dangling reference that
    // cannot be re-derived. This way the worst case is an orphaned file.
    const uploadsDir = path.join(workDir, "uploads");
    await mkdir(uploadsDir, { recursive: true });
    for (const upload of UPLOAD_DIRS) {
      const destination = path.join(uploadsDir, upload.name);
      await mkdir(destination, { recursive: true });
      // A directory that was never created just means nothing of that kind
      // has been uploaded yet — the one case that is legitimately empty.
      if (!(await isDirectory(upload.dir))) continue;
      // execFile with an argument array, not `sh -c`: the old shell string
      // quoted paths with JSON.stringify, which does not escape `$` or
      // backticks. And no `|| true` with stderr thrown away — that turned a
      // copy that failed half-way (full disk, unreadable file) into a backup
      // reported as successful and missing your artwork, discovered only at
      // restore time. A failed copy now fails the backup, loudly.
      // The trailing /. copies the contents rather than the directory itself.
      await execFileAsync("cp", ["-R", `${upload.dir}/.`, `${destination}/`], {
        timeout: DUMP_TIMEOUT_MS,
      });
    }

    // What this archive can be restored onto. Restoring a dump that is NEWER
    // than the running code looks like it works and does not: drizzle's
    // migrator compares each local journal entry against the single newest
    // row in __drizzle_migrations, so a database already past every local
    // migration causes it to skip all of them and report success — leaving
    // the app querying columns its schema no longer matches. Recording the
    // level here is what lets a restore refuse that outright.
    const migration = await latestMigration();

    // The manifest §18 asks for: what this archive is, what it holds, and
    // enough of a fingerprint to tell whether it still holds it.
    //
    // Checksums are over the files as they go *into* the tar, not over the
    // tar itself. A checksum of the archive would only prove the archive
    // downloaded intact, which gzip's own CRC already does; hashing the
    // members is what catches a truncated dump or a half-copied image, which
    // is the failure that actually loses data and the one you find out about
    // during a restore.
    const checksums = await checksumDirectory(workDir);

    const manifest: BackupManifest = {
      backupVersion: BACKUP_FORMAT_VERSION,
      appVersion: APP_VERSION,
      schemaVersion: migration?.tag ?? null,
      createdAt: new Date().toISOString(),
      // Kept at the top level under their original names as well as inside
      // `manifest`: restore.ts reads these two directly and predates the
      // rest, so moving them would make every existing archive unreadable
      // by the version gate that exists to protect them.
      latestMigrationTag: migration?.tag ?? null,
      latestMigrationWhen: migration?.when ?? null,
      components: ["db.sql", ...UPLOAD_DIRS.map((upload) => upload.name)],
      checksums,
    };

    await writeFile(
      path.join(workDir, "meta.json"),
      JSON.stringify(manifest, null, 2),
    );

    await execFileAsync(
      "tar",
      ["-czf", partialPath, "-C", workDir, "db.sql", "meta.json", "uploads"],
      {
        timeout: DUMP_TIMEOUT_MS,
      },
    );
    await rename(partialPath, finalPath);

    await pruneOldBackups(options.protect);

    const info = await stat(finalPath);
    const backup = {
      name,
      sizeBytes: info.size,
      createdAt: info.mtime.toISOString(),
    };
    await logActivity("backup", options.reason ?? "Backup created", {
      name,
      sizeBytes: info.size,
    });
    return backup;
  } catch (err) {
    // Each cleanup step guarded on its own: one of them throwing here would
    // replace the real error with a less useful one.
    await rm(partialPath, { force: true }).catch(() => {});
    await logActivity("backup", "Backup failed", {
      error: scrubSecrets(err instanceof Error ? err.message : String(err)),
    }).catch(() => {});
    throw err;
  } finally {
    try {
      if (workDir) await rm(workDir, { recursive: true, force: true });
    } finally {
      running = false;
    }
  }
}

async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

/**
 * Keeps the connection string out of anything shown or logged. It is no
 * longer passed on the command line, so this is belt and braces.
 */
function scrubSecrets(message: string): string {
  const databaseUrl = process.env.DATABASE_URL;
  return databaseUrl ? message.split(databaseUrl).join("<database url>") : message;
}
