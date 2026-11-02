/**
 * The composable filter set the browse page carries in its URL (§7).
 *
 * In the URL rather than component state for the same reason the sort
 * already is: a filtered view is a place, and it has to survive a reload, a
 * back button and a pasted link. It is also what makes scroll restoration
 * per-view — the router keys saved positions on the full href, so each
 * filtered list remembers its own position instead of all of them sharing
 * one.
 *
 * Every field is optional and absent means "don't filter", never "false".
 * `watched` in particular is tri-state: unwatched-only and no-opinion are
 * different requests, and a boolean with a default cannot say both.
 */
export type Filters = {
  tags: string[];
  performers: string[];
  studio?: string;
  kind?: string;
  year?: number;
  watched?: boolean;
  /** Tri-state like `watched`: true is organised only, false is "not organised". */
  organised?: boolean;
  favorite?: boolean;
  /** Seconds. */
  minDuration?: number;
  maxDuration?: number;
  resolution?: string;
  format?: string;
  /** Days. "Recently added" as a number, so the chip can say how recent. */
  addedWithin?: number;
  /** 1–5: "at least this many stars". Unrated items never match. */
  minRating?: number;
};

export const EMPTY_FILTERS: Filters = { tags: [], performers: [] };

export const RESOLUTION_OPTIONS = [
  { value: "sd", label: "SD" },
  { value: "hd", label: "HD" },
  { value: "fullhd", label: "Full HD" },
  { value: "4k", label: "4K" },
] as const;

/**
 * Duration bands, as the ranges people actually ask for.
 *
 * Offered instead of two number inputs because "under 10 minutes" is the
 * question; "600" is an implementation detail of it. The underlying filter
 * still takes seconds, so a hand-built URL can be as precise as it likes.
 */
export const DURATION_OPTIONS = [
  { value: "short", label: "Under 10 min", min: undefined, max: 600 },
  { value: "medium", label: "10–30 min", min: 600, max: 1800 },
  { value: "long", label: "30–60 min", min: 1800, max: 3600 },
  { value: "feature", label: "Over 1 hour", min: 3600, max: undefined },
] as const;

export const ADDED_WITHIN_OPTIONS = [
  { value: 1, label: "Today" },
  { value: 7, label: "This week" },
  { value: 30, label: "This month" },
  { value: 365, label: "This year" },
] as const;

/** The sort orders the grid offers. Mirrors the server's `SORTS`. */
export const SORT_OPTIONS = [
  { value: "newest", label: "Recently added" },
  { value: "oldest", label: "Oldest first" },
  // Release date, as parsed from the filename — the scene's own chronology,
  // as opposed to when the file arrived here. Listed next to the added-date
  // pair because the two are easy to confuse and sit better compared than
  // apart; items with no date parsed sort last either way.
  { value: "released", label: "Newest release" },
  { value: "releasedOldest", label: "Oldest release" },
  { value: "title", label: "Title A–Z" },
  { value: "titleDesc", label: "Title Z–A" },
  { value: "longest", label: "Longest" },
  { value: "shortest", label: "Shortest" },
  { value: "watched", label: "Recently watched" },
  { value: "played", label: "Most played" },
  { value: "rating", label: "Highest rated" },
  { value: "largest", label: "Largest file" },
  { value: "smallest", label: "Smallest file" },
  { value: "random", label: "Random" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

export function isSortValue(value: unknown): value is SortValue {
  return SORT_OPTIONS.some((option) => option.value === value);
}

/** Whether anything is filtering at all — drives "Clear filters". */
export function hasActiveFilters(filters: Filters): boolean {
  return activeFilterChips(filters).length > 0;
}

export type FilterChip = {
  /** What to show on the chip. */
  label: string;
  /** The filters with just this one removed, for the chip's × button. */
  without: Filters;
};

/**
 * The active filters, as the chips the page shows above the grid.
 *
 * §7 requires active filters to be visible and individually removable, and
 * never silently reset. Deriving the chips from the filter object rather
 * than tracking them separately is what guarantees the two agree: a filter
 * that is applied but has no chip is one the user cannot see or turn off.
 */
export function activeFilterChips(filters: Filters): FilterChip[] {
  const chips: FilterChip[] = [];

  for (const tag of filters.tags) {
    chips.push({
      label: `Tag: ${tag}`,
      without: { ...filters, tags: filters.tags.filter((t) => t !== tag) },
    });
  }
  for (const performer of filters.performers) {
    chips.push({
      label: `Performer: ${performer}`,
      without: {
        ...filters,
        performers: filters.performers.filter((p) => p !== performer),
      },
    });
  }
  if (filters.studio)
    chips.push({
      label: `Studio: ${filters.studio}`,
      without: { ...filters, studio: undefined },
    });
  if (filters.kind)
    chips.push({
      label: `Category: ${filters.kind}`,
      without: { ...filters, kind: undefined },
    });
  if (filters.year !== undefined)
    chips.push({
      label: `Year: ${filters.year}`,
      without: { ...filters, year: undefined },
    });
  if (filters.watched !== undefined)
    chips.push({
      label: filters.watched ? "Watched" : "Unwatched",
      without: { ...filters, watched: undefined },
    });
  if (filters.organised !== undefined)
    chips.push({
      label: filters.organised ? "Organised" : "Not organised",
      without: { ...filters, organised: undefined },
    });
  if (filters.favorite)
    chips.push({
      label: "Favourites",
      without: { ...filters, favorite: undefined },
    });
  if (filters.minRating !== undefined)
    chips.push({
      label: filters.minRating === 5 ? "5 stars" : `${filters.minRating}+ stars`,
      without: { ...filters, minRating: undefined },
    });
  if (filters.resolution) {
    const option = RESOLUTION_OPTIONS.find(
      (entry) => entry.value === filters.resolution,
    );
    chips.push({
      label: option ? option.label : `Resolution: ${filters.resolution}`,
      without: { ...filters, resolution: undefined },
    });
  }
  if (filters.format)
    chips.push({
      label: filters.format.toUpperCase(),
      without: { ...filters, format: undefined },
    });
  if (filters.minDuration !== undefined || filters.maxDuration !== undefined) {
    const named = DURATION_OPTIONS.find(
      (option) =>
        option.min === filters.minDuration && option.max === filters.maxDuration,
    );
    chips.push({
      label: named ? named.label : describeDuration(filters),
      without: { ...filters, minDuration: undefined, maxDuration: undefined },
    });
  }
  if (filters.addedWithin !== undefined) {
    const option = ADDED_WITHIN_OPTIONS.find(
      (entry) => entry.value === filters.addedWithin,
    );
    chips.push({
      label: `Added: ${option ? option.label.toLowerCase() : `last ${filters.addedWithin}d`}`,
      without: { ...filters, addedWithin: undefined },
    });
  }

  return chips;
}

function describeDuration(filters: Filters): string {
  const min = filters.minDuration;
  const max = filters.maxDuration;
  const mins = (seconds: number) => `${Math.round(seconds / 60)} min`;
  if (min !== undefined && max !== undefined)
    return `${mins(min)}–${mins(max)}`;
  if (min !== undefined) return `Over ${mins(min)}`;
  return `Under ${mins(max ?? 0)}`;
}

/**
 * The filters as the query string the API expects.
 *
 * Only non-empty values are written, so an unfiltered view produces no
 * parameters at all — which keeps the React Query cache key stable and stops
 * two identical requests looking different because one carried `tags=`.
 */
export function filterParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.tags.length > 0) params.set("tags", filters.tags.join(","));
  if (filters.performers.length > 0)
    params.set("performers", filters.performers.join(","));
  if (filters.studio) params.set("studio", filters.studio);
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.year !== undefined) params.set("year", String(filters.year));
  if (filters.watched !== undefined)
    params.set("watched", String(filters.watched));
  if (filters.organised !== undefined)
    params.set("organised", String(filters.organised));
  if (filters.favorite) params.set("favorite", "true");
  if (filters.minDuration !== undefined)
    params.set("minDuration", String(filters.minDuration));
  if (filters.maxDuration !== undefined)
    params.set("maxDuration", String(filters.maxDuration));
  if (filters.resolution) params.set("resolution", filters.resolution);
  if (filters.format) params.set("format", filters.format);
  if (filters.addedWithin !== undefined)
    params.set("addedWithin", String(filters.addedWithin));
  if (filters.minRating !== undefined)
    params.set("minRating", String(filters.minRating));
  return params;
}

/** A comma list from the URL, as a validated array. */
function readList(value: unknown): string[] {
  if (typeof value !== "string" || value === "") return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function readNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** A star floor from the URL; anything outside 1–5 is dropped, not clamped. */
function readRating(value: unknown): number | undefined {
  const parsed = readNumber(value);
  return parsed !== undefined && Number.isInteger(parsed) && parsed >= 1 && parsed <= 5
    ? parsed
    : undefined;
}

/**
 * Reads filters back out of a router search object.
 *
 * Tolerant by design: a hand-edited or stale URL should drop the parts it
 * cannot parse and keep the rest, rather than throwing and losing the whole
 * view. §7's "never silently reset filters" is about the app resetting them,
 * not about honouring nonsense.
 */
export function filtersFromSearch(search: Record<string, unknown>): Filters {
  return {
    tags: readList(search.tags),
    performers: readList(search.performers),
    studio: typeof search.studio === "string" ? search.studio : undefined,
    kind: typeof search.kind === "string" ? search.kind : undefined,
    year: readNumber(search.year),
    watched:
      search.watched === "true" || search.watched === true
        ? true
        : search.watched === "false" || search.watched === false
          ? false
          : undefined,
    organised:
      search.organised === "true" || search.organised === true
        ? true
        : search.organised === "false" || search.organised === false
          ? false
          : undefined,
    favorite: search.favorite === "true" || search.favorite === true,
    minDuration: readNumber(search.minDuration),
    maxDuration: readNumber(search.maxDuration),
    resolution:
      typeof search.resolution === "string" ? search.resolution : undefined,
    format: typeof search.format === "string" ? search.format : undefined,
    addedWithin: readNumber(search.addedWithin),
    minRating: readRating(search.minRating),
  };
}

/**
 * Filters as a flat search object for the router.
 *
 * Undefined entries are included deliberately: TanStack Router strips them
 * when building the href, and passing them explicitly is what *removes* a
 * filter that was previously in the URL. Omitting the key would merge the
 * old value back in.
 */
export function filtersToSearch(filters: Filters): Record<string, unknown> {
  return {
    tags: filters.tags.length > 0 ? filters.tags.join(",") : undefined,
    performers:
      filters.performers.length > 0 ? filters.performers.join(",") : undefined,
    studio: filters.studio,
    kind: filters.kind,
    year: filters.year,
    watched: filters.watched === undefined ? undefined : String(filters.watched),
    organised:
      filters.organised === undefined ? undefined : String(filters.organised),
    favorite: filters.favorite ? "true" : undefined,
    minDuration: filters.minDuration,
    maxDuration: filters.maxDuration,
    resolution: filters.resolution,
    format: filters.format,
    addedWithin: filters.addedWithin,
    minRating: filters.minRating,
  };
}
