import { pkey } from "./profileStorage";
import { EMPTY_FILTERS, filtersFromSearch, type Filters } from "./filters";

/**
 * A named filter set you can come back to (§7).
 *
 * Stored as the search string rather than a parsed object, for the same
 * reason the filters live in the URL in the first place: the URL is already
 * the canonical description of a view, and keeping a second representation
 * of one means two things to migrate every time a filter is added. Restoring
 * a saved search is then a navigation, not a state restore.
 *
 * Local rather than server-side, matching pinned items. These are a personal
 * shortcut on one machine, and the server has no notion of a saved view to
 * hang them off; if that changes, `read`/`write` are the only two functions
 * that would move.
 */
export type SavedSearch = {
  id: string;
  name: string;
  /** A query string, without the leading "?". */
  search: string;
  createdAt: string;
};

const STORAGE_KEY = "saved-searches";
const CHANGE_EVENT = "media-server:saved-searches-changed";

// Enough to be useful, few enough that the sidebar stays a sidebar.
const MAX_SAVED = 30;

export function readSavedSearches(): SavedSearch[] {
  try {
    const value = JSON.parse(
      localStorage.getItem(pkey(STORAGE_KEY)) ?? "[]",
    ) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is SavedSearch =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as SavedSearch).id === "string" &&
        typeof (entry as SavedSearch).name === "string" &&
        typeof (entry as SavedSearch).search === "string",
    );
  } catch {
    return [];
  }
}

function write(entries: SavedSearch[]): void {
  try {
    localStorage.setItem(pkey(STORAGE_KEY), JSON.stringify(entries));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Saved searches are optional when browser storage is unavailable.
  }
}

export function saveSearch(name: string, search: string): SavedSearch {
  const entry: SavedSearch = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    // Normalised so the same view saved twice from different orderings of
    // the same parameters is recognisably the same saved search.
    search: new URLSearchParams(search).toString(),
    createdAt: new Date().toISOString(),
  };
  // Replacing by name rather than appending: saving "Unwatched" twice means
  // updating it, and a list with two identical labels helps nobody.
  const existing = readSavedSearches().filter(
    (saved) => saved.name.toLowerCase() !== entry.name.toLowerCase(),
  );
  write([entry, ...existing].slice(0, MAX_SAVED));
  return entry;
}

export function removeSavedSearch(id: string): void {
  write(readSavedSearches().filter((entry) => entry.id !== id));
}

/** Every saved search, for signing out. */
export function clearSavedSearches(): void {
  try {
    localStorage.removeItem(pkey(STORAGE_KEY));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // As above.
  }
}

export function savedSearchesChangedEvent(): string {
  return CHANGE_EVENT;
}

/**
 * The filters a saved search represents, for showing what it will do.
 *
 * Parsed on read rather than stored alongside, so a saved search made before
 * a filter existed simply doesn't carry it, instead of carrying a stale
 * snapshot of a shape that has since changed.
 */
export function savedSearchFilters(entry: SavedSearch): Filters {
  try {
    return filtersFromSearch(
      Object.fromEntries(new URLSearchParams(entry.search)),
    );
  } catch {
    return EMPTY_FILTERS;
  }
}

/**
 * A name to offer when saving, derived from what is actually filtered.
 *
 * Suggested rather than imposed — the field is editable — but a sensible
 * default is what stops a list of saved searches all called "Search 1".
 */
export function suggestSearchName(filters: Filters, query?: string): string {
  const parts: string[] = [];
  if (query) parts.push(`“${query}”`);
  if (filters.watched === false) parts.push("Unwatched");
  if (filters.watched === true) parts.push("Watched");
  if (filters.favorite) parts.push("Favourites");
  parts.push(...filters.performers);
  parts.push(...filters.tags);
  if (filters.studio) parts.push(filters.studio);
  if (filters.year !== undefined) parts.push(String(filters.year));
  return parts.slice(0, 3).join(" · ") || "Saved view";
}
