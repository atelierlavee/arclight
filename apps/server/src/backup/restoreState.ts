import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { APP_DATA_ROOT } from "../media/cache.js";

/**
 * Whether a restore currently owns the database.
 *
 * Its own module, with no imports beyond the app-data path, so the request
 * gate, the scan timer and the restore itself can all read it without an
 * import cycle between buildApp, the scanner and backup/restore.
 */
let restoring = false;

export function isRestoring(): boolean {
  return restoring;
}

/**
 * Claims the restore slot, or returns false if one is already running.
 *
 * Synchronous and check-and-set in one call, deliberately: `createBackup` and
 * `startScan` both reserve their slot before their first await because two
 * near-simultaneous requests would otherwise both pass an `if (running)`
 * check. Exposing only this makes that the sole way in.
 */
export function claimRestore(): boolean {
  if (restoring) return false;
  restoring = true;
  return true;
}

export function releaseRestore(): void {
  restoring = false;
}

/**
 * A note on disk saying a restore was underway.
 *
 * Lives in APP_DATA_ROOT rather than a table, because the whole point is to
 * survive the database being dropped and recreated — and to survive the
 * process dying mid-restore, which an in-memory flag cannot.
 *
 * The database half is atomic (psql runs the dump in a single transaction, so
 * a crash rolls it back whole). The marker therefore means one of the steps
 * *after* the database was replaced did not finish — the uploads swap, the
 * migrations, the seed — whether because the process died or because the
 * step failed (restoreBackup leaves the marker in place in that case). That
 * is recoverable from the safety backup it names, which is why boot logs it
 * rather than refusing to start.
 */
export const RESTORE_MARKER_PATH = path.join(
  APP_DATA_ROOT,
  "restore-in-progress.json"
);

export type RestoreMarker = {
  startedAt: string;
  source: string;
  safetyBackup: string | null;
};

export async function writeRestoreMarker(
  marker: RestoreMarker
): Promise<void> {
  await writeFile(RESTORE_MARKER_PATH, JSON.stringify(marker, null, 2));
}

export async function readRestoreMarker(): Promise<RestoreMarker | null> {
  try {
    return JSON.parse(
      await readFile(RESTORE_MARKER_PATH, "utf8")
    ) as RestoreMarker;
  } catch {
    // Absent is the normal case, and an unreadable one is not worth failing
    // boot over — it is a breadcrumb, not state anything depends on.
    return null;
  }
}

export async function clearRestoreMarker(): Promise<void> {
  await rm(RESTORE_MARKER_PATH, { force: true });
}
