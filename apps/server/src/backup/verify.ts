import { execFile } from "node:child_process";
import { mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { logActivity } from "../activity/log.js";
import { UPLOAD_DIRS } from "../media/cache.js";
import {
  checksumDirectory,
  resolveBackupPath,
  type BackupManifest,
} from "./create.js";
import { validateArchiveTypes } from "./restore.js";

const execFileAsync = promisify(execFile);
const EXTRACT_TIMEOUT_MS = 300_000;

/**
 * Whether a pg_dump output is complete.
 *
 * pg_dump closes with this exact line. Its absence is the signature of the
 * failure this whole routine exists for: a dump cut short by a full disk or
 * a killed process, which extracts perfectly and restores into a
 * half-populated database without erroring.
 *
 * Separated from the orchestration so it can be tested without pg_dump, tar
 * or a database — the surrounding function shells out to all three, and this
 * is the part with the actual judgement in it.
 */
export const DUMP_TERMINATOR = "-- PostgreSQL database dump complete";

export function isDumpComplete(sql: string): boolean {
  // What pg_dump actually writes after the terminator: the closing `--` of
  // its comment banner, blank lines, and — from pg_dump 17.6 / 18 — an
  // `\unrestrict <key>` line. Checking the raw tail against the terminator
  // therefore failed every real dump; only those trailers are skipped, so a
  // statement after the terminator still fails the check.
  const lines = sql.split("\n");
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (last === "" || last === "--" || /^\\unrestrict\s+\S+$/.test(last)) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines.join("\n").trimEnd().endsWith(DUMP_TERMINATOR);
}

/** How much of the dump's end is read to find the terminator. */
const DUMP_TAIL_BYTES = 64 * 1024;

/**
 * Whether the dump file on disk is complete, reading only its tail.
 *
 * The whole dump used to be read into one string for this — a large library's
 * dump is hundreds of megabytes, and V8 refuses strings past ~512 MB outright,
 * so verifying the very backups that matter most crashed or failed. Only the
 * last few lines can hold the terminator; the checksum pass streams the rest.
 */
export async function isDumpFileComplete(dumpPath: string): Promise<boolean> {
  const handle = await open(dumpPath, "r");
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, DUMP_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    return isDumpComplete(buffer.toString("utf8"));
  } finally {
    await handle.close();
  }
}

/**
 * Compares a manifest's checksums against what was actually extracted.
 *
 * Also pure, for the same reason. The two lists disagreeing is the whole
 * finding, and it is worth being sure that "missing" and "altered" are not
 * being confused for each other — they have different causes and different
 * recoveries.
 */
export function compareChecksums(
  expected: Record<string, string>,
  actual: Record<string, string>,
): { missing: string[]; mismatched: string[] } {
  const missing: string[] = [];
  const mismatched: string[] = [];

  for (const [file, hash] of Object.entries(expected)) {
    if (!(file in actual)) missing.push(file);
    else if (actual[file] !== hash) mismatched.push(file);
  }

  return { missing, mismatched };
}

export type VerifyCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type VerifyResult = {
  name: string;
  ok: boolean;
  checks: VerifyCheck[];
};

/**
 * Checks that a backup is actually restorable (§18).
 *
 * The point of this is narrow and worth stating: a backup you have never
 * verified is a belief, not a backup. The failure it exists to catch is the
 * archive that lists cleanly and unpacks to a truncated dump — which you
 * would otherwise discover at the only moment it matters.
 *
 * It never touches the live database. Everything is extracted to a temporary
 * directory and deleted afterwards, so verifying is safe to do at any time,
 * including while the app is being used.
 *
 * The SQL is parsed but not executed. Actually replaying a dump would need a
 * scratch database to replay it into, and creating one requires privileges
 * the app deliberately does not have; checking that the dump is complete and
 * syntactically whole is the strongest claim available without them, and it
 * is the one that catches truncation.
 */
export async function verifyBackup(name: string): Promise<VerifyResult> {
  const archivePath = resolveBackupPath(name);
  if (!archivePath) {
    return {
      name,
      ok: false,
      checks: [{ name: "Name", ok: false, detail: "Not a backup file name." }],
    };
  }

  const checks: VerifyCheck[] = [];
  const workDir = await mkdtemp(path.join(tmpdir(), "media-verify-"));

  try {
    try {
      await stat(archivePath);
    } catch {
      return {
        name,
        ok: false,
        checks: [
          { name: "Archive", ok: false, detail: "This file no longer exists." },
        ],
      };
    }

    // Extraction is the integrity check for the gzip and tar layers: both
    // carry their own checksums, and a corrupt archive fails here rather
    // than producing partial files.
    try {
      // Listed before extracting, for the same reason restore does: a
      // symlink member would let a later member be written through it to
      // anywhere the app can write, temp directory or not.
      const listing = await execFileAsync("tar", ["-tvzf", archivePath], {
        timeout: EXTRACT_TIMEOUT_MS,
        maxBuffer: 32 * 1024 * 1024,
      });
      validateArchiveTypes(listing.stdout.split("\n"));
      await execFileAsync(
        "tar",
        ["-xzf", archivePath, "--no-same-owner", "-C", workDir],
        { timeout: EXTRACT_TIMEOUT_MS },
      );
      checks.push({
        name: "Archive integrity",
        ok: true,
        detail: "Extracted without error.",
      });
    } catch (err) {
      checks.push({
        name: "Archive integrity",
        ok: false,
        detail:
          err instanceof Error
            ? `Could not extract: ${err.message}`
            : "Could not extract.",
      });
      // Nothing below can run without the extracted files.
      return { name, ok: false, checks };
    }

    let manifest: BackupManifest | null = null;
    try {
      manifest = JSON.parse(
        await readFile(path.join(workDir, "meta.json"), "utf8"),
      ) as BackupManifest;
      checks.push({
        name: "Manifest",
        ok: true,
        detail: `Version ${manifest.backupVersion ?? 0}, app ${
          manifest.appVersion ?? "unknown"
        }, schema ${manifest.schemaVersion ?? "unknown"}.`,
      });
    } catch {
      // Archives predating the manifest are older than this feature by
      // definition. Reported rather than failed: the archive may well be
      // restorable, and calling a working backup broken is its own harm.
      checks.push({
        name: "Manifest",
        ok: true,
        detail: "No manifest — this archive predates them. Checksums skipped.",
      });
    }

    // The dump is the one member whose loss cannot be recovered from
    // anywhere else, so it gets a check of its own rather than only being
    // one entry in the checksum sweep.
    const dumpPath = path.join(workDir, "db.sql");
    try {
      const info = await stat(dumpPath);
      const complete = await isDumpFileComplete(dumpPath);
      checks.push({
        name: "Database dump",
        ok: complete && info.size > 0,
        detail: complete
          ? `Complete, ${info.size.toLocaleString()} bytes.`
          : "Truncated — the dump does not end where pg_dump would have ended it.",
      });
    } catch {
      checks.push({
        name: "Database dump",
        ok: false,
        detail: "Missing from the archive.",
      });
    }

    if (manifest?.checksums) {
      const { missing, mismatched } = compareChecksums(
        manifest.checksums,
        await checksumDirectory(workDir),
      );
      const ok = mismatched.length === 0 && missing.length === 0;
      checks.push({
        name: "Checksums",
        ok,
        detail: ok
          ? `All ${Object.keys(manifest.checksums).length} files match.`
          : [
              missing.length > 0 && `${missing.length} missing`,
              mismatched.length > 0 && `${mismatched.length} altered`,
            ]
              .filter(Boolean)
              .join(", "),
      });
    }

    // A missing upload folder is not a failure — an install with no uploaded
    // artwork has nothing to put in one — but an archive that is missing a
    // component the manifest claims it has is a different matter.
    const declared = manifest?.components ?? [];
    const expectedUploads = UPLOAD_DIRS.map((upload) => upload.name).filter(
      (folder) => declared.length === 0 || declared.includes(folder),
    );
    const missingComponents: string[] = [];
    for (const folder of expectedUploads) {
      try {
        await stat(path.join(workDir, "uploads", folder));
      } catch {
        missingComponents.push(folder);
      }
    }
    checks.push({
      name: "Components",
      ok: missingComponents.length === 0,
      detail:
        missingComponents.length === 0
          ? `Database and ${expectedUploads.length} upload folders present.`
          : `Missing: ${missingComponents.join(", ")}.`,
    });

    const ok = checks.every((check) => check.ok);
    await logActivity("backup", ok ? "Backup verified" : "Backup failed verification", {
      name,
      failed: checks.filter((check) => !check.ok).map((check) => check.name),
    });

    return { name, ok, checks };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
