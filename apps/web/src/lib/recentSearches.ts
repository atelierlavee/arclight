import { pkey } from "./profileStorage";
/**
 * The last few things typed into the command palette (§7).
 *
 * Queries only — never results, and never what was opened from them. A list
 * of the titles you looked at is a much more sensitive record than a list of
 * words you typed, and §29 makes the smaller of the two the right thing to
 * keep.
 */

const STORAGE_KEY = "recent-searches";

// Enough to save retyping, short enough that the palette still opens on
// commands rather than on history.
const MAX_RECENT = 6;

// Below this a query is a keystroke on the way to a real one, and storing it
// fills the list with prefixes of the search you actually ran.
const MIN_LENGTH = 2;

export function readRecentSearches(): string[] {
  try {
    const value = JSON.parse(
      localStorage.getItem(pkey(STORAGE_KEY)) ?? "[]",
    ) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

/** Records a query, moving a repeat to the front rather than duplicating it. */
export function recordRecentSearch(query: string): string[] {
  const trimmed = query.trim();
  if (trimmed.length < MIN_LENGTH) return readRecentSearches();

  const next = [
    trimmed,
    ...readRecentSearches().filter(
      (entry) => entry.toLowerCase() !== trimmed.toLowerCase(),
    ),
  ].slice(0, MAX_RECENT);

  try {
    localStorage.setItem(pkey(STORAGE_KEY), JSON.stringify(next));
  } catch {
    // History is a convenience; losing it is survivable.
  }
  return next;
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(pkey(STORAGE_KEY));
  } catch {
    // As above.
  }
}
