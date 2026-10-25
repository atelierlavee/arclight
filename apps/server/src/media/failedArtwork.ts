/**
 * Remembers which artwork builds just failed, so a file ffmpeg can't decode
 * isn't re-encoded on every scan.
 *
 * A failure writes nothing, so the "is it cached?" check never passes and a
 * truncated video cost minutes of CPU each scheduled scan, for ever. In
 * memory and time-limited on purpose: it must never outlive a fix — a restart,
 * a replaced file (new hash) or a day all give the build another chance — and
 * it's bounded so it can't grow without limit.
 */
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 5000;
const failures = new Map<string, number>();

const keyFor = (kind: string, mediaItemId: number, contentHash: string | null) =>
  `${kind}:${mediaItemId}:${contentHash ?? ""}`;

export function recentlyFailed(
  kind: "poster" | "preview",
  mediaItemId: number,
  contentHash: string | null,
): boolean {
  const key = keyFor(kind, mediaItemId, contentHash);
  const at = failures.get(key);
  if (at === undefined) return false;
  if (Date.now() - at < RETRY_AFTER_MS) return true;
  failures.delete(key);
  return false;
}

export function markFailed(
  kind: "poster" | "preview",
  mediaItemId: number,
  contentHash: string | null,
): void {
  if (failures.size >= MAX_ENTRIES) {
    // Oldest first: Map iterates in insertion order.
    const oldest = failures.keys().next().value;
    if (oldest !== undefined) failures.delete(oldest);
  }
  failures.set(keyFor(kind, mediaItemId, contentHash), Date.now());
}
