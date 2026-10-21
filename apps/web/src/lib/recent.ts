import { pkey } from "./profileStorage";
/**
 * What you have recently looked at, played, edited and favourited (§3).
 *
 * Local, and deliberately separate from playback state. The server already
 * knows what you have *watched* — that is what Continue Watching reads — but
 * "I opened this and backed out again" is not a viewing, and writing it to
 * playback state would put everything you glanced at into Continue Watching.
 *
 * Kept out of the database for the same reason: this is browsing exhaust,
 * one machine's worth, and §29 is explicit that the product should not
 * accumulate more record of what you looked at than it needs. localStorage
 * is also the one store that cannot be exfiltrated by a request.
 */

export type RecentKind = "browsed" | "played" | "edited" | "favourited";

export type RecentEntry = {
  id: number;
  /** Denormalised so a row can render before any item request resolves. */
  title: string;
  thumbnailFile?: string | null;
  durationSeconds?: number | null;
  /** ISO 8601. */
  at: string;
};

const CHANGE_EVENT = "media-server:recent-changed";

/**
 * How many of each kind to keep.
 *
 * A row shows a handful; the rest is headroom so that removing an item from
 * the library doesn't empty the row. Beyond this the list is history nobody
 * scrolls, and every entry is a little more record of what you watched than
 * the app needs to keep.
 */
const MAX_PER_KIND = 40;

function storageKey(kind: RecentKind): string {
  return `recent-${kind}`;
}

/**
 * The last timestamp handed out, so two writes never share one.
 *
 * `Date.now()` has millisecond resolution and several of these fire together
 * — favouriting from the grid records "favourited" and the undo toast can
 * land in the same tick. Identical timestamps make the merged
 * "recently interacted" ordering depend on which kind happens to be read
 * first, which is not an order at all. Nudging forward by a millisecond
 * costs nothing: these are compared against each other, never against a
 * clock.
 */
let lastStamp = 0;

function nextStamp(): string {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return new Date(lastStamp).toISOString();
}

export function readRecent(kind: RecentKind): RecentEntry[] {
  try {
    const value = JSON.parse(
      localStorage.getItem(pkey(storageKey(kind))) ?? "[]",
    ) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is RecentEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as RecentEntry).id === "number" &&
        typeof (entry as RecentEntry).title === "string",
    );
  } catch {
    return [];
  }
}

/**
 * Records an interaction, moving an item to the front if it is already there.
 *
 * Moved rather than appended so the list is "most recent first" with no
 * duplicates — opening the same video six times should not fill the row with
 * six copies of it.
 */
export function recordRecent(
  kind: RecentKind,
  item: {
    id: number;
    title: string;
    thumbnailFile?: string | null;
    durationSeconds?: number | null;
  },
): void {
  try {
    const existing = readRecent(kind).filter((entry) => entry.id !== item.id);
    const next: RecentEntry[] = [
      {
        id: item.id,
        title: item.title,
        thumbnailFile: item.thumbnailFile ?? null,
        durationSeconds: item.durationSeconds ?? null,
        at: nextStamp(),
      },
      ...existing,
    ].slice(0, MAX_PER_KIND);

    localStorage.setItem(pkey(storageKey(kind)), JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // History is a convenience; losing it is survivable, crashing isn't.
  }
}

export function clearRecent(kind: RecentKind): void {
  try {
    localStorage.removeItem(pkey(storageKey(kind)));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // As above.
  }
}

/**
 * Drops an item from every kind at once — for an item that has gone away
 * (hidden, moved to the vault), which should stop being "recent" anywhere.
 */
export function forgetRecent(id: number): void {
  const kinds: RecentKind[] = ["browsed", "played", "edited", "favourited"];
  try {
    for (const kind of kinds) {
      const entries = readRecent(kind);
      const kept = entries.filter((entry) => entry.id !== id);
      if (kept.length !== entries.length) {
        localStorage.setItem(pkey(storageKey(kind)), JSON.stringify(kept));
      }
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // As above.
  }
}

/** Every kind's history, for signing out. */
export function clearAllRecent(): void {
  for (const kind of ["browsed", "played", "edited", "favourited"] as const) {
    clearRecent(kind);
  }
}

export function recentChangedEvent(): string {
  return CHANGE_EVENT;
}

/**
 * Everything you have touched, newest first, however you touched it (§3's
 * "Recently Interacted").
 *
 * Merged by id so an item you played and then favourited appears once, at
 * whichever of the two was later — the row answers "what have I been working
 * with", and the same item twice is not two answers.
 */
export function readRecentlyInteracted(): RecentEntry[] {
  const byId = new Map<number, RecentEntry>();
  const kinds: RecentKind[] = ["browsed", "played", "edited", "favourited"];

  for (const kind of kinds) {
    for (const entry of readRecent(kind)) {
      const existing = byId.get(entry.id);
      if (!existing || existing.at < entry.at) byId.set(entry.id, entry);
    }
  }

  return [...byId.values()]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_PER_KIND);
}
