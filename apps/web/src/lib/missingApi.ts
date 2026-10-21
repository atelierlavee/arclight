import { PrivacyLockedError } from "./privacyLock";

// Shared with every other guarded call, so one `instanceof` check covers
// them all; re-exported so existing imports from here keep working.
export { PrivacyLockedError };

/** A video whose file the scanner could not find. */
export type MissingVideo = {
  id: number;
  /** Always "video"; the list is scoped to them, and MediaCard needs it. */
  itemType: "video";
  title: string;
  /** Where the file used to be. Null if no file row survives. */
  path: string | null;
  missingSince: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  thumbnailFile: string | null;
  thumbnailPositionX: number;
  thumbnailPositionY: number;
  thumbnailScale: number;
};

export const missingQueryKey = ["missing-videos"] as const;

async function failed(res: Response): Promise<Error> {
  if (res.status === 403) {
    const body = (await res.json().catch(() => null)) as { code?: string } | null;
    if (body?.code === "privacy_locked") return new PrivacyLockedError();
  }
  return new Error(`Request failed: ${res.status}`);
}

export async function fetchMissing(): Promise<{ items: MissingVideo[] }> {
  const res = await fetch("/api/missing");
  if (!res.ok) throw await failed(res);
  return res.json();
}

/**
 * Removes the given items from the library.
 *
 * `removed` can be lower than the number asked for: the server re-checks that
 * each id really is a missing video, and silently skips any that is not.
 */
export async function forgetMissing(ids: number[]): Promise<{ removed: number }> {
  const res = await fetch("/api/missing/forget", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw await failed(res);
  return res.json();
}

export async function forgetAllMissing(): Promise<{ removed: number }> {
  const res = await fetch("/api/missing/forget-all", { method: "POST" });
  if (!res.ok) throw await failed(res);
  return res.json();
}
