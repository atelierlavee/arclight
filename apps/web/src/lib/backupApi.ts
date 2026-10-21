import { PrivacyLockedError, throwIfNotOk } from "./privacyLock";

// Shared with every other guarded call, so one `instanceof` check covers
// them all; re-exported so existing imports from here keep working.
export { PrivacyLockedError };

export type BackupFile = { name: string; sizeBytes: number; createdAt: string };

export type RestoreResult = {
  ok: true;
  source: string;
  /** The snapshot taken of the pre-restore library, so this is undoable. */
  safetyBackup: string | null;
  /** Whether the archive predated the current schema and had to be migrated. */
  migrated: boolean;
  uploads: string[];
};

/**
 * Replaces the entire library with the contents of an archive.
 *
 * Deliberately has no timeout. The request holds open for the whole restore —
 * seconds to a minute — and abandoning it client-side would not stop the
 * server, it would only lose the one account of what happened.
 */
export async function restoreBackup(name: string): Promise<RestoreResult> {
  const res = await fetch(`/api/backups/${encodeURIComponent(name)}/restore`, {
    method: "POST",
  });
  const data = (await res.json().catch(() => null)) as
    | (Partial<RestoreResult> & { error?: string; code?: string })
    | null;
  if (res.status === 403 && data?.code === "privacy_locked") {
    throw new PrivacyLockedError();
  }
  if (!res.ok) throw new Error(data?.error ?? `Restore failed: ${res.status}`);
  return data as RestoreResult;
}

export async function fetchBackups(): Promise<{ backups: BackupFile[] }> {
  const res = await fetch("/api/backups");
  if (!res.ok) throw new Error(`Failed to load backups: ${res.status}`);
  return res.json();
}

export async function createBackup(): Promise<{ backup: BackupFile }> {
  const res = await fetch("/api/backups", { method: "POST" });
  const data = (await res.json().catch(() => null)) as
    | { backup?: BackupFile; error?: string }
    | null;
  if (!res.ok) throw new Error(data?.error ?? `Backup failed: ${res.status}`);
  return data as { backup: BackupFile };
}

export async function deleteBackup(name: string): Promise<void> {
  const res = await fetch(`/api/backups/${encodeURIComponent(name)}`, { method: "DELETE" });
  await throwIfNotOk(res, "Failed to delete backup");
}

export function backupDownloadUrl(name: string): string {
  return `/api/backups/${encodeURIComponent(name)}`;
}

/**
 * Starts a backup download, or throws PrivacyLockedError if it would be
 * refused.
 *
 * A plain link can't tell: a refused download just saves the error JSON as
 * the archive. So this asks for the first byte first — the route serves
 * ranges, so that costs nothing — and only hands the URL to the browser once
 * the server has said yes.
 */
export async function downloadBackup(name: string): Promise<void> {
  const url = backupDownloadUrl(name);
  const res = await fetch(url, { headers: { Range: "bytes=0-0" } });
  await throwIfNotOk(res, "Failed to download backup");
  void res.body?.cancel().catch(() => {});
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type VerifyCheck = { name: string; ok: boolean; detail: string };

export type VerifyResult = {
  name: string;
  ok: boolean;
  checks: VerifyCheck[];
};

/**
 * Checks that an archive is actually restorable (§18).
 *
 * A POST because it does real work — a full extract and a hash of every
 * member — even though it changes nothing.
 */
export async function verifyBackup(name: string): Promise<VerifyResult> {
  const res = await fetch(`/api/backups/${encodeURIComponent(name)}/verify`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Could not verify: ${res.status}`);
  return res.json();
}

/**
 * How old a backup may get before the panel says so (§18).
 *
 * A week, because that is the span over which "I have a backup" stops being
 * a useful statement about a library you are actively adding to. Below it the
 * panel stays quiet — a warning that is always on is not a warning.
 */
export const STALE_BACKUP_DAYS = 7;

export function backupAgeDays(createdAt: string | null | undefined): number | null {
  if (!createdAt) return null;
  const at = Date.parse(createdAt);
  if (!Number.isFinite(at)) return null;
  return (Date.now() - at) / (24 * 60 * 60 * 1000);
}

export function isBackupStale(createdAt: string | null | undefined): boolean {
  const age = backupAgeDays(createdAt);
  // Never backed up at all counts as stale: it is the case the warning most
  // needs to cover, and treating "no data" as "fine" is how it gets missed.
  if (age === null) return true;
  return age > STALE_BACKUP_DAYS;
}
