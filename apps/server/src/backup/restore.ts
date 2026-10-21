import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { logActivity } from "../activity/log.js";
import { db, drainPool, runMigrations } from "../db/client.js";
import { latestMigration } from "../db/journal.js";
import { seed, seedCategories } from "../db/seed.js";
import { APP_DATA_ROOT } from "../media/cache.js";
import { restartScanSchedule, stopScanSchedule } from "../scanner/schedule.js";
import { isScanRunning } from "../scanner/pipeline.js";
import {
  createBackup,
  isBackupRunning,
  resolveBackupPath,
  type BackupFile,
} from "./create.js";
import {
  claimRestore,
  clearRestoreMarker,
  releaseRestore,
  writeRestoreMarker,
} from "./restoreState.js";
import { pgChildEnv } from "./pgEnv.js";

const execFileAsync = promisify(execFile);

const PSQL_TIMEOUT_MS = 600_000;

// psql -f prints a command tag per statement and, because the dump is
// --if-exists, a "NOTICE: ... skipping" for every object that isn't there
// yet. execFile's default maxBuffer is 1 MB, and overflowing it does not
// truncate the output — it SIGTERMs the child, which here means killing psql
// part-way through a restore. createBackup never hit this only because
// pg_dump --file writes nothing to stdout.
const PSQL_MAX_BUFFER = 32 * 1024 * 1024;

/** Carries the HTTP status the route should answer with. */
export class RestoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RestoreError";
  }
}

export type RestoreResult = {
  ok: true;
  source: string;
  safetyBackup: string | null;
  migrated: boolean;
  uploads: string[];
};

type ArchiveMeta = {
  createdAt?: string;
  latestMigrationTag?: string | null;
  latestMigrationWhen?: number | null;
};

/**
 * Confirms the archive contains only what a backup of ours contains.
 *
 * The name is already constrained to BACKUP_DIR by resolveBackupPath, so this
 * is about the *contents*: a tar member like `../../etc/something` or an
 * absolute path would otherwise be written wherever it pointed when extracted.
 * Anything outside `db.sql`, `meta.json` and a single level of `uploads/<dir>/`
 * means this is not one of ours, and the safe response is to stop rather than
 * guess.
 */
export function validateArchiveMembers(members: string[]): string[] {
  const uploads = new Set<string>();
  for (const raw of members) {
    const member = raw.replace(/\/+$/, "");
    if (member === "" || member === ".") continue;
    if (member.startsWith("/") || member.split("/").includes("..")) {
      throw new RestoreError(`Archive contains an unsafe path: ${raw}`, 400);
    }
    if (member === "db.sql" || member === "meta.json") continue;
    const parts = member.split("/");
    if (parts[0] !== "uploads") {
      throw new RestoreError(`Archive contains an unexpected entry: ${raw}`, 400);
    }
    if (parts.length >= 2 && parts[1]) uploads.add(parts[1]);
  }
  return [...uploads].sort();
}

/**
 * Refuses any archive member that is not a plain file or directory.
 *
 * Paths alone are not enough: a symlink member `uploads/x -> /etc` passes the
 * name check, and the next member written through it lands outside the
 * extract directory; a hard link can alias any file the app can read into
 * the restored uploads. Nothing a backup of ours writes is either, so any
 * link is refused outright rather than reasoned about.
 *
 * Takes the lines of `tar -tvzf`, whose first character is the entry type —
 * `-` file, `d` directory, `l` symlink, `h` hard link, and `c`/`b`/`p` for
 * devices and FIFOs, which are refused for the same reason.
 */
export function validateArchiveTypes(verboseListing: string[]): void {
  for (const line of verboseListing) {
    if (line.trim() === "") continue;
    const type = line[0];
    if (type !== "-" && type !== "d") {
      throw new RestoreError(
        `Archive contains a link or special file, which a backup never ` +
          `does: ${line.trim()}`,
        400,
      );
    }
    // GNU tar lists a hard link with a regular-file mode but a
    // "link to <target>" suffix, so the type character alone misses it.
    if (/ link to /.test(line) || / -> /.test(line)) {
      throw new RestoreError(
        `Archive contains a link, which a backup never does: ${line.trim()}`,
        400,
      );
    }
  }
}

/**
 * The psql meta-commands a pg_dump file legitimately contains.
 *
 * `\connect` appears in dumps that switch databases; `\restrict` and
 * `\unrestrict` bracket every dump from pg_dump 17.6 / 18 onward, precisely
 * so that a dump cannot smuggle in other meta-commands.
 */
const ALLOWED_META_COMMANDS = new Set(["connect", "c", "restrict", "unrestrict"]);

/**
 * Refuses a dump containing psql meta-commands pg_dump would never write.
 *
 * psql executes whatever it is fed, and `\!` runs a shell command as the app
 * user — so a crafted archive was code execution, not just a bad database.
 * There is no psql switch that disables meta-commands, so the dump is
 * checked before psql sees it.
 *
 * COPY-aware: inside a `COPY ... FROM stdin;` block every line is data, and
 * data lines legitimately start with a backslash — `\N` for a null in the
 * first column, `\\` for an escaped one, and the `\.` that ends the block.
 */
export async function findForbiddenMetaCommand(
  lines: AsyncIterable<string> | Iterable<string>,
): Promise<string | null> {
  let inCopy = false;
  for await (const line of lines) {
    if (inCopy) {
      if (line === "\\.") inCopy = false;
      continue;
    }
    if (/^COPY .* FROM stdin;$/.test(line)) {
      inCopy = true;
      continue;
    }
    const meta = /^\s*\\([A-Za-z!?]*)/.exec(line);
    if (meta && !ALLOWED_META_COMMANDS.has(meta[1])) return line;
  }
  return null;
}

async function assertDumpIsSafe(dumpPath: string): Promise<void> {
  const reader = createInterface({
    input: createReadStream(dumpPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  try {
    const bad = await findForbiddenMetaCommand(reader);
    if (bad !== null) {
      throw new RestoreError(
        `The database dump contains a psql command pg_dump never writes ` +
          `(${bad.slice(0, 40)}), so it was not run.`,
        400,
      );
    }
  } finally {
    reader.close();
  }
}

/**
 * Refuses a dump taken by a newer version of the app.
 *
 * Drizzle's migrator only ever reads the *local* journal, comparing each entry
 * against the single newest row in __drizzle_migrations. A database already
 * past every local migration therefore matches nothing, so migrate() skips the
 * lot and returns successfully — leaving the app querying a schema it does not
 * model, with columns renamed or dropped out from under it. Nothing later
 * catches that, so it has to be caught here.
 */
export async function assertRestorable(meta: ArchiveMeta | null): Promise<void> {
  const local = await latestMigration();
  const archiveWhen = meta?.latestMigrationWhen;
  if (typeof archiveWhen !== "number" || !local) return;
  if (archiveWhen > local.when) {
    throw new RestoreError(
      `This backup was taken by a newer version of the app ` +
        `(${meta?.latestMigrationTag ?? "unknown"}) than the one running ` +
        `(${local.tag}). Update first, then restore.`,
      409,
    );
  }
}

async function readArchiveMeta(dir: string): Promise<ArchiveMeta | null> {
  try {
    return JSON.parse(
      await readFile(path.join(dir, "meta.json"), "utf8"),
    ) as ArchiveMeta;
  } catch {
    // Archives predating the manifest. They are older than this feature by
    // definition, so the version gate has nothing to check — the caller logs
    // that it was skipped rather than letting it pass silently.
    return null;
  }
}

/**
 * Replaces the database and uploaded images with the contents of an archive.
 *
 * Runs in-process rather than as the stop-the-container script it used to be:
 * runMigrations() is exported and retries its connection, so the app can swap
 * its own database and then bring an older dump up to current code itself.
 *
 * The ordering is load-bearing throughout — see the comments at each step.
 */
export async function restoreBackup(name: string): Promise<RestoreResult> {
  // Reserved before the first await, the same way createBackup and startScan
  // reserve theirs: two near-simultaneous requests would both pass a plain
  // `if (restoring)` check and race each other into psql.
  if (!claimRestore()) {
    throw new RestoreError("A restore is already running", 409);
  }

  let workDir: string | null = null;
  // Set the moment psql returns successfully. From then on the old database
  // is gone for good, and everything the error path says has to reflect that.
  let committed = false;
  let safetyName: string | null = null;
  try {
    if (isScanRunning()) {
      throw new RestoreError(
        "A library scan is running — wait for it to finish",
        409,
      );
    }
    if (isBackupRunning()) {
      throw new RestoreError("A backup is running — wait for it to finish", 409);
    }

    const archivePath = resolveBackupPath(name);
    if (!archivePath) throw new RestoreError("Invalid backup name", 400);

    // The timer cannot be stopped by the HTTP gate, and a scan starting
    // mid-restore would insert into tables being dropped.
    stopScanSchedule();

    // Inside APP_DATA_ROOT, not tmpdir(): the uploads are swapped into place
    // with rename(), which fails EXDEV across filesystems — and /tmp is the
    // container's writable layer while app-data is a mounted volume.
    workDir = await mkdtemp(path.join(APP_DATA_ROOT, ".restore-"));

    // Worked on from a copy so the restore never depends on the original
    // surviving — including surviving the safety backup's own pruning.
    const localArchive = path.join(workDir, "archive.tar.gz");
    await copyFile(archivePath, localArchive);

    const listed = await execFileAsync("tar", ["-tzf", localArchive], {
      maxBuffer: PSQL_MAX_BUFFER,
    });
    const uploadDirs = validateArchiveMembers(listed.stdout.split("\n"));
    const verbose = await execFileAsync("tar", ["-tvzf", localArchive], {
      maxBuffer: PSQL_MAX_BUFFER,
    });
    validateArchiveTypes(verbose.stdout.split("\n"));

    const extractDir = path.join(workDir, "extracted");
    await execFileAsync("tar", [
      "-xzf",
      localArchive,
      "--no-same-owner",
      "-C",
      await mkdirp(extractDir),
    ]);

    const dumpPath = path.join(extractDir, "db.sql");
    if (!(await exists(dumpPath))) {
      throw new RestoreError("Archive has no db.sql — is this a backup?", 400);
    }

    const meta = await readArchiveMeta(extractDir);
    await assertRestorable(meta);
    await assertDumpIsSafe(dumpPath);

    // After the gate, never before: anything written between this snapshot and
    // psql would be captured by neither the safety backup nor the dump, and so
    // would be lost with no way back.
    const safety = await takeSafetyBackup(name);
    safetyName = safety?.name ?? null;

    // The barrier. An idle connection holds no locks, but one mid-query holds
    // ACCESS SHARE, which blocks the DROPs — forever, since nothing sets a
    // lock_timeout by default. A failure here must abort rather than proceed.
    await drainPool();

    await writeRestoreMarker({
      startedAt: new Date().toISOString(),
      source: name,
      safetyBackup: safety?.name ?? null,
    });

    await runPsql(dumpPath, workDir);
    committed = true;

    const uploads = await swapUploads(extractDir, uploadDirs);

    // Fresh connections, then everything app.ts does on boot. Replaying only
    // the migrations would leave seed rows missing from a dump taken before
    // they existed, and the scan timer armed from pre-restore settings.
    await drainPool();
    const migrated = await bringSchemaUpToDate();
    await seed();
    await seedCategories();
    await restartScanSchedule();

    await clearRestoreMarker();
    // Written only now: the old database, and any activity row in it, stopped
    // existing several steps ago.
    await logActivity("backup", `Restored from ${name}`, {
      name,
      safetyBackup: safety?.name ?? null,
      migrated,
    });

    return {
      ok: true,
      source: name,
      safetyBackup: safety?.name ?? null,
      migrated,
      uploads,
    };
  } catch (err) {
    if (!committed) {
      // psql runs the dump in a single transaction, so a failure up to and
      // including it has left the database exactly as it was: nothing to
      // flag, and a working library to keep scanning.
      await clearRestoreMarker().catch(() => {});
      await restartScanSchedule().catch(() => {});
      throw err;
    }

    // Past the commit. The database already IS the backup's, so the "rolled
    // back, nothing changed" wording the earlier failures carry would be a
    // lie here — and believing it, someone would carry on using a library
    // whose uploads may be half-swapped or whose schema was never brought up
    // to date. The marker stays on disk so the next boot says so too.
    const message = err instanceof Error ? err.message : String(err);
    await restartScanSchedule().catch(() => {});
    await logActivity("backup", `Restore from ${name} did not finish`, {
      name,
      safetyBackup: safetyName,
      error: message,
    }).catch(() => {});
    throw new RestoreError(
      `The database was replaced with ${name}, but a later step failed: ` +
        `${message}. Restart the app to retry the migrations; if uploaded ` +
        `images are missing, restore the safety backup ` +
        `${safetyName ?? "(none was taken)"}.`,
      500,
    );
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true });
    releaseRestore();
  }
}

async function mkdirp(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  return dir;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Snapshots the current state so a restore is undoable.
 *
 * `protect` keeps the archive being restored from out of the pruning that this
 * extra backup would otherwise trigger — see pruneOldBackups. A failure to
 * snapshot is fatal on purpose: proceeding would destroy the library with no
 * way back, which is precisely what this exists to prevent.
 */
async function takeSafetyBackup(source: string): Promise<BackupFile | null> {
  try {
    return await createBackup({
      protect: source,
      reason: "Safety backup before restore",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new RestoreError(
      `Could not take a safety backup first, so nothing was changed: ${message}`,
      500,
    );
  }
}

/**
 * Clears out the current database in the same transaction the dump runs in.
 *
 * pg_dump --clean only drops the objects *in the dump*. Restoring a backup
 * taken before watch_log or playback_heatmap existed therefore left those
 * tables in place — and their foreign keys to media_items made the dump's own
 * `DROP TABLE media_items` fail, so older backups simply could not be
 * restored. Emptying the schemas first makes a restore a clean replace, and
 * the migrations that run afterwards recreate the newer tables.
 *
 * Every relation in `public` is dropped rather than the schema itself: in
 * Postgres 15+ `public` belongs to pg_database_owner, and dropping it needs
 * privileges a database owner may not hold, while the tables are always the
 * app's own. Extensions are left alone for the same reason. drizzle's own
 * schema is the app's to drop outright, and the dump recreates it.
 *
 * Runs inside psql's single transaction alongside the dump, so a failure
 * anywhere rolls the drops back too.
 */
const RESTORE_PRELUDE = `
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      -- Partitions go with their parent; extension-owned relations with
      -- their extension.
      AND NOT c.relispartition
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = c.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format(
      CASE r.relkind
        WHEN 'v' THEN 'DROP VIEW IF EXISTS public.%I CASCADE'
        WHEN 'm' THEN 'DROP MATERIALIZED VIEW IF EXISTS public.%I CASCADE'
        WHEN 'f' THEN 'DROP FOREIGN TABLE IF EXISTS public.%I CASCADE'
        ELSE 'DROP TABLE IF EXISTS public.%I CASCADE'
      END,
      r.relname
    );
  END LOOP;
  -- Sequences not owned by a table (owned ones went with it above).
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = c.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS public.%I CASCADE', r.relname);
  END LOOP;
END
$$;
DROP SCHEMA IF EXISTS drizzle CASCADE;
`;

async function runPsql(dumpPath: string, workDir: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new RestoreError("DATABASE_URL is not set", 500);

  const preludePath = path.join(workDir, "prelude.sql");
  await writeFile(preludePath, RESTORE_PRELUDE);

  try {
    await execFileAsync(
      "psql",
      [
        // --single-transaction is the whole safety story. With more than one
        // -f it wraps all of them, so the prelude's drops and the dump commit
        // or roll back together: a failure part-way leaves the database
        // byte-identical to before, turning "your database is now wrecked"
        // into "nothing happened".
        "--single-transaction",
        "-v",
        "ON_ERROR_STOP=1",
        // No ~/.psqlrc: whatever is in the app user's home directory has no
        // business running inside a restore.
        "-X",
        // Quiet, because the output is bounded by maxBuffer and a per-statement
        // command tag on a large dump is a lot of it.
        "-q",
        "-f",
        preludePath,
        "-f",
        dumpPath,
      ],
      {
        timeout: PSQL_TIMEOUT_MS,
        maxBuffer: PSQL_MAX_BUFFER,
        // Connection settings in the environment rather than argv, so the
        // password is neither in the process table nor in an error message.
        env: pgChildEnv(databaseUrl, {
          // A straggler connection we failed to drain should fail this fast
          // rather than block the DROP indefinitely — and with it every reader
          // that queues behind the lock request.
          PGOPTIONS: "-c lock_timeout=10s",
        }),
      },
    );
  } catch (err) {
    throw new RestoreError(
      `Restoring the database failed, so it was rolled back and nothing ` +
        `changed: ${psqlFailure(err, databaseUrl)}`,
      500,
    );
  }
}

/**
 * The reason psql failed, without the connection string.
 *
 * The URL is no longer on the command line, so nothing should echo it; it is
 * still scrubbed in case, since this text is surfaced verbatim in the UI and
 * the activity log. The bare password is deliberately not scrubbed: psql has
 * no way to learn it except from PGPASSWORD, which it never prints, and a
 * short password ("media") replaced inside table names made the real error
 * unreadable.
 */
export function psqlFailure(err: unknown, databaseUrl: string): string {
  const stderr =
    typeof err === "object" && err && "stderr" in err
      ? String((err as { stderr?: unknown }).stderr ?? "").trim()
      : "";
  const message = err instanceof Error ? err.message : String(err);
  return (stderr || message).split(databaseUrl).join("<database url>");
}

/**
 * Swaps the archive's uploaded images into place, one directory at a time.
 *
 * Iterates what the archive actually holds rather than the current
 * UPLOAD_DIRS. scripts/restore.sh carries the scar for this: it named two
 * directories while the backup had grown a third, so kind-covers restored to
 * nothing and only during a real recovery would anyone find out. `name` is a
 * plain basename under APP_DATA_ROOT by construction (cache.test.ts enforces
 * it), so the archive describes its own destinations.
 *
 * Replace, not merge: `cp -R src/. dst/` would leave files belonging to the
 * destroyed install sitting among the restored ones, referenced by nothing.
 * The safety backup is what makes replacing safe.
 */
async function swapUploads(
  extractDir: string,
  uploadDirs: string[],
): Promise<string[]> {
  const restored: string[] = [];
  for (const name of uploadDirs) {
    const staged = path.join(extractDir, "uploads", name);
    if (!(await exists(staged))) continue;
    const target = path.join(APP_DATA_ROOT, name);
    const displaced = `${target}.replaced-${Date.now()}`;

    // Move the current one aside before moving the new one in, so the window
    // where neither is in place is a single rename wide.
    if (await exists(target)) await rename(target, displaced);
    try {
      await rename(staged, target);
    } catch (err) {
      if (await exists(displaced)) await rename(displaced, target);
      throw err;
    }
    await rm(displaced, { recursive: true, force: true });
    restored.push(name);
  }
  return restored;
}

/**
 * Replays any migrations the dump predates, reporting whether it had to.
 *
 * Compared before and after rather than inferred: the migrator is silent about
 * what it did, and "did this old backup need bringing forward" is the one
 * thing worth telling the user afterwards.
 */
async function bringSchemaUpToDate(): Promise<boolean> {
  const before = await currentDbMigration();
  await runMigrations();
  const after = await currentDbMigration();
  return before !== after;
}

async function currentDbMigration(): Promise<number | null> {
  try {
    const rows = await db.execute<{ created_at: string | number | null }>(
      sql`select created_at from drizzle.__drizzle_migrations
          order by created_at desc limit 1`,
    );
    const value = rows.rows[0]?.created_at;
    return value == null ? null : Number(value);
  } catch {
    return null;
  }
}
