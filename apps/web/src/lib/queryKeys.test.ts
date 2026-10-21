import { describe, expect, it, vi } from "vitest";
import { partialMatchKey, QueryClient, type QueryKey } from "@tanstack/react-query";
import { itemScopedKeys, qk } from "./queryKeys";
import {
  invalidateItem,
  invalidateItemEverywhere,
  invalidateItemWatchState,
  invalidatePerformer,
} from "./invalidate";

/** True when invalidating `prefix` would hit a query cached under `key`. */
const hits = (prefix: QueryKey, key: QueryKey) => partialMatchKey(key, prefix);

describe("qk — wire format", () => {
  // The values are the cache's wire format: these pin the ones that other
  // code, tests or persisted state may still spell out.
  it("keeps the established key values", () => {
    expect(qk.mediaItems.all).toEqual(["media-items"]);
    expect(qk.mediaItem.detail(7)).toEqual(["media-item", 7]);
    expect(qk.performer.detail(3)).toEqual(["performer", 3]);
    expect(qk.libraryStats).toEqual(["library-stats"]);
    expect(qk.libraryCleanup).toEqual(["library-cleanup"]);
    expect(qk.missingVideos).toEqual(["missing-videos"]);
    expect(qk.authStatus).toEqual(["auth-status"]);
    expect(qk.collectionItems.row(4)).toEqual(["collection-items", "row", 4]);
    expect(qk.inbox.page(2)).toEqual(["inbox", 2]);
  });

  it("keeps every grid filter in the library grid key", () => {
    expect(
      qk.mediaItems.grid({
        tag: "t", performer: "p", studio: "s", kind: "k", q: "q", parentId: 9,
        sort: "random", year: 2020, filters: "a=1", month: 5, seed: 42,
      }),
    ).toEqual(["media-items", "t", "p", "s", "k", "q", 9, "random", 2020, "a=1", 5, 42]);
  });
});

describe("qk — prefixes", () => {
  it.each<[string, QueryKey, QueryKey]>([
    ["item detail", qk.mediaItem.all, qk.mediaItem.detail(1)],
    ["grid", qk.mediaItems.all, qk.mediaItems.grid({
      tag: undefined, performer: undefined, studio: undefined, kind: undefined, q: undefined,
      parentId: undefined, sort: "title", year: null, filters: "", month: null, seed: null,
    })],
    ["home rows", qk.mediaItems.all, qk.mediaItems.recent],
    ["random picks", qk.mediaItems.all, qk.mediaItems.randomPicks(1)],
    ["tag row", qk.mediaItems.all, qk.mediaItems.tagRow("x")],
    ["collection grid", qk.collectionItems.all, qk.collectionItems.list(1)],
    ["collection row", qk.collectionItems.all, qk.collectionItems.row(1)],
    ["performer page", qk.performer.all, qk.performer.detail(1)],
    ["performer network", qk.performers.all, qk.performers.network("shared")],
    ["performer panels", qk.performers.all, qk.performers.latestVideos("A")],
    ["performer videos", qk.performerVideos.all, qk.performerVideos.list("A", {}, "date")],
    ["in progress", qk.performerInProgress.all, qk.performerInProgress.forPerformer(1)],
    ["studio panels", qk.studios.all, qk.studios.videos("S")],
    ["series page", qk.series.all, qk.series.detail(1)],
    ["albums row", qk.albums.all, qk.albums.list("A", null)],
    ["related", qk.relatedItems.all, qk.relatedItems.forItem(1)],
    ["daily pick", qk.dailyPick.all, qk.dailyPick.forSeed(1)],
    ["search", qk.searchSuggestions.all, qk.searchSuggestions.forQuery("q")],
    ["play surface", qk.playSurface.all, qk.playSurface.list("home", [1])],
    ["inbox page", qk.inbox.all, qk.inbox.page(1)],
    ["activity", qk.activity.all, qk.activity.byType("scan")],
  ])("%s sits under its family key", (_, prefix, key) => {
    expect(hits(prefix, key)).toBe(true);
  });

  it("keeps sibling families apart", () => {
    // "media-item" must not be a prefix of "media-items", nor "performer" of
    // "performers": invalidating one family must not silently refresh another.
    expect(hits(qk.mediaItem.all, qk.mediaItems.all)).toBe(false);
    expect(hits(qk.mediaItems.all, qk.mediaItem.detail(1))).toBe(false);
    expect(hits(qk.performer.all, qk.performers.all)).toBe(false);
    expect(hits(qk.mediaItem.detail(1), qk.mediaItem.detail(2))).toBe(false);
  });

  it("includes the item detail among an item's scoped keys", () => {
    expect(itemScopedKeys(5)).toContainEqual(qk.mediaItem.detail(5));
    for (const key of itemScopedKeys(5)) expect(key[1]).toBe(5);
  });
});

describe("grouped invalidation", () => {
  function invalidated(run: (client: QueryClient) => void): QueryKey[] {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    run(client);
    return spy.mock.calls.map(([filters]) => filters!.queryKey!);
  }

  it("invalidateItem refreshes the detail and the lists", () => {
    expect(invalidated((c) => invalidateItem(c, 1))).toEqual([
      qk.mediaItem.detail(1),
      qk.mediaItems.all,
    ]);
  });

  it("invalidateItemWatchState also refreshes both in-progress rows", () => {
    const keys = invalidated((c) => invalidateItemWatchState(c, 1));
    expect(keys).toContainEqual(qk.continueWatching);
    expect(keys).toContainEqual(qk.performerInProgress.all);
  });

  it("invalidateItemEverywhere reaches every surface that draws an item", () => {
    const keys = invalidated((c) => invalidateItemEverywhere(c, 1));
    for (const key of [
      qk.mediaItems.all,
      qk.mediaItem.detail(1),
      qk.collectionItems.all,
      qk.continueWatching,
      qk.heroItems,
      qk.relatedItems.all,
      qk.performerVideos.all,
      qk.performerInProgress.all,
      qk.libraryStats,
    ]) {
      expect(keys).toContainEqual(key);
    }
    // Without an id it covers every item's detail instead.
    expect(invalidated((c) => invalidateItemEverywhere(c))).toContainEqual(qk.mediaItem.all);
  });

  it("invalidatePerformer refreshes their page and every performer list", () => {
    expect(invalidated((c) => invalidatePerformer(c, 3))).toEqual([
      qk.performer.detail(3),
      qk.performers.all,
    ]);
  });
});

/**
 * Static guard: every cache key goes through `qk`.
 *
 * A key spelled inline is how invalidations drift from the queries they are
 * meant to refresh. This scans the source rather than trusting review.
 */
describe("no inline query keys", () => {
  const sources = import.meta.glob<string>("/src/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  const scanned = Object.entries(sources).filter(
    ([file]) =>
      !file.endsWith("/lib/queryKeys.ts") &&
      !/\.test\.tsx?$/.test(file) &&
      !file.startsWith("/src/test/"),
  );

  const clientMethods = [
    "invalidateQueries", "removeQueries", "refetchQueries", "cancelQueries", "resetQueries",
    "setQueryData", "setQueriesData", "getQueryData", "getQueriesData", "getQueryState",
    "prefetchQuery", "prefetchInfiniteQuery", "fetchQuery", "fetchInfiniteQuery",
    "ensureQueryData", "ensureInfiniteQueryData",
  ].join("|");

  const rules: [string, RegExp][] = [
    ["inline `queryKey: [`", /queryKey\s*:\s*\[/g],
    [
      "inline array passed to the query client",
      new RegExp(`\\.(?:${clientMethods})\\s*(?:<[^>()]*>)?\\(\\s*\\[`, "g"),
    ],
  ];

  // Every family root the factory knows, so a bare `["media-items"]` in a
  // hand-rolled loop is caught too.
  const roots = new Set<string>();
  (function collect(node: unknown) {
    if (Array.isArray(node)) {
      if (typeof node[0] === "string") roots.add(node[0]);
    } else if (typeof node === "function") {
      collect((node as (...args: unknown[]) => unknown)({}, {}, {}));
    } else if (node && typeof node === "object") {
      for (const value of Object.values(node)) collect(value);
    }
  })(qk);
  // A key literal: an array led by a known root that is assigned, or is one
  // entry in a list of keys (the hand-rolled `for (const key of [[...], ...])`
  // shape). Plain string arrays that happen to share a word are left alone.
  rules.push([
    "key literal",
    new RegExp(`(?:=|\\[|,)\\s*\\[\\s*"(?:${[...roots].join("|")})"\\s*[,\\]]`, "g"),
  ]);

  /** Blanks out comments, keeping line numbers, so prose may name keys. */
  const stripComments = (text: string) =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
      .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

  it("finds the source files", () => {
    expect(scanned.length).toBeGreaterThan(50);
    expect(roots.has("media-items")).toBe(true);
    expect(roots.has("library-stats")).toBe(true);
  });

  it("uses the qk factory for every key", () => {
    const offences: string[] = [];
    for (const [file, raw] of scanned) {
      const text = stripComments(raw);
      for (const [what, re] of rules) {
        for (const match of text.matchAll(re)) {
          const line = text.slice(0, match.index).split("\n").length;
          offences.push(`${file}:${line} ${what}: ${match[0]}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });
});
