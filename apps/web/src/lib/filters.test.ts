import { describe, expect, it } from "vitest";
import {
  activeFilterChips,
  EMPTY_FILTERS,
  filterParams,
  filtersFromSearch,
  filtersToSearch,
  hasActiveFilters,
  type Filters,
} from "./filters";

describe("filterParams", () => {
  it("writes nothing for an unfiltered view", () => {
    expect(filterParams(EMPTY_FILTERS).toString()).toBe("");
  });

  it("joins multi-value filters into one parameter", () => {
    const params = filterParams({
      ...EMPTY_FILTERS,
      tags: ["indoor", "night"],
    });
    expect(params.get("tags")).toBe("indoor,night");
  });

  // false is a filter ("unwatched only"); undefined is no filter at all.
  // Collapsing the two is how "show me unwatched" turns into "show me
  // everything" on a reload.
  it("distinguishes an unwatched filter from no watched filter", () => {
    expect(filterParams({ ...EMPTY_FILTERS, watched: false }).get("watched")).toBe(
      "false",
    );
    expect(filterParams(EMPTY_FILTERS).has("watched")).toBe(false);
  });
});

describe("activeFilterChips", () => {
  it("gives every applied filter a chip, so none is invisible", () => {
    const filters: Filters = {
      tags: ["indoor"],
      performers: ["Alice"],
      studio: "Acme",
      year: 2019,
      watched: false,
      favorite: true,
      resolution: "fullhd",
      addedWithin: 7,
      minDuration: 600,
      maxDuration: 1800,
    };
    const labels = activeFilterChips(filters).map((chip) => chip.label);
    expect(labels).toEqual([
      "Tag: indoor",
      "Performer: Alice",
      "Studio: Acme",
      "Year: 2019",
      "Unwatched",
      "Favourites",
      "Full HD",
      "10–30 min",
      "Added: this week",
    ]);
  });

  it("removes only its own filter, leaving the rest applied", () => {
    const filters: Filters = {
      ...EMPTY_FILTERS,
      tags: ["indoor", "night"],
      studio: "Acme",
    };
    const chip = activeFilterChips(filters).find((c) => c.label === "Tag: night");
    expect(chip?.without.tags).toEqual(["indoor"]);
    expect(chip?.without.studio).toBe("Acme");
  });

  it("reports nothing active for the empty set", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    // A `favorite: false` is the absence of a filter, not a filter for
    // non-favourites — there is no such view.
    expect(hasActiveFilters({ ...EMPTY_FILTERS, favorite: false })).toBe(false);
  });

  it("names a duration range that matches no preset", () => {
    const labels = activeFilterChips({
      ...EMPTY_FILTERS,
      minDuration: 120,
      maxDuration: 240,
    }).map((chip) => chip.label);
    expect(labels).toEqual(["2 min–4 min"]);
  });
});

describe("filtersFromSearch", () => {
  it("round-trips through the router's search object", () => {
    const filters: Filters = {
      tags: ["a", "b"],
      performers: ["Alice"],
      studio: "Acme",
      kind: "movie",
      year: 2019,
      watched: false,
      favorite: true,
      watchLater: true,
      minDuration: 600,
      maxDuration: 1800,
      resolution: "hd",
      format: "mp4",
      addedWithin: 30,
    };
    expect(filtersFromSearch(filtersToSearch(filters))).toEqual(filters);
  });

  // A stale or hand-edited link should lose the part it cannot parse and
  // keep the rest, rather than throwing away the whole view.
  it("drops unparseable values without discarding the good ones", () => {
    const filters = filtersFromSearch({
      tags: "indoor",
      year: "not-a-year",
      watched: "maybe",
    });
    expect(filters.tags).toEqual(["indoor"]);
    expect(filters.year).toBeUndefined();
    expect(filters.watched).toBeUndefined();
  });

  it("passes undefined for cleared filters so the router drops them", () => {
    // Omitting the key would merge the previous value back in, which is how
    // a filter you just removed reappears on the next navigation.
    expect(filtersToSearch(EMPTY_FILTERS)).toHaveProperty("studio", undefined);
    expect("studio" in filtersToSearch(EMPTY_FILTERS)).toBe(true);
  });
});

describe("organised filter", () => {
  it("is tri-state like watched: false is its own request", () => {
    expect(filterParams({ ...EMPTY_FILTERS, organised: false }).get("organised")).toBe("false");
    expect(filterParams({ ...EMPTY_FILTERS, organised: true }).get("organised")).toBe("true");
    expect(filterParams(EMPTY_FILTERS).has("organised")).toBe(false);
  });

  it("has a chip that removes only itself, and survives the URL", () => {
    const filters: Filters = { ...EMPTY_FILTERS, organised: false, favorite: true };
    const chip = activeFilterChips(filters).find((c) => c.label === "Not organised");
    expect(chip?.without).toMatchObject({ organised: undefined, favorite: true });
    expect(filtersFromSearch(filtersToSearch(filters)).organised).toBe(false);
    expect(filtersFromSearch({ organised: "maybe" }).organised).toBeUndefined();
  });
});
