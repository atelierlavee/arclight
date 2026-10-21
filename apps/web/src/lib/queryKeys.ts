/**
 * Every React Query cache key the app uses, in one place.
 *
 * Spell keys through this factory — never inline. A key written by hand in a
 * mutation drifts from the one the query actually uses (a rename here, a
 * typo there) and the invalidation silently refreshes nothing: that is how
 * the bulk bar went on invalidating ["stats"] long after the library stats
 * had moved to ["library-stats"]. A static test (queryKeys.test.ts) fails on
 * any inline `queryKey: [` or inline array handed to the query client.
 *
 * Keys are hierarchical, and a shorter key is a *prefix* of the longer ones
 * under it: React Query's invalidateQueries / removeQueries / cancelQueries
 * match by prefix, so `qk.mediaItem.all` (["media-item"]) hits every
 * `qk.mediaItem.detail(id)`, and `qk.mediaItems.all` hits every grid and home
 * row. Use the `all` (or bare) key to invalidate a family; use the full key
 * for useQuery and for get/setQueryData, which match exactly.
 *
 * The array values are the wire format of the cache — changing one is a
 * behaviour change, not a refactor.
 */

/** An id as it reaches a key: route params arrive as strings, rows as numbers. */
type Id = number | string | null | undefined;

export const qk = {
  /** Lists of items: the library grid and every home row. */
  mediaItems: {
    all: ["media-items"] as const,
    /** The library grid; every filter must be in here or results leak across filters. */
    grid: (f: {
      tag: unknown;
      performer: unknown;
      studio: unknown;
      kind: unknown;
      q: unknown;
      parentId: unknown;
      sort: unknown;
      year: unknown;
      filters: string;
      month: unknown;
      seed: unknown;
    }) =>
      [
        "media-items",
        f.tag,
        f.performer,
        f.studio,
        f.kind,
        f.q,
        f.parentId,
        f.sort,
        f.year,
        f.filters,
        f.month,
        f.seed,
      ] as const,
    recent: ["media-items", "recent"] as const,
    favorites: ["media-items", "favorites"] as const,
    recentlyWatched: ["media-items", "recently-watched"] as const,
    mostPlayed: ["media-items", "most-played"] as const,
    unwatched: ["media-items", "unwatched"] as const,
    heroPicker: ["media-items", "hero-picker"] as const,
    homeCollage: ["media-items", "home-collage"] as const,
    randomPicks: (seed: unknown) => ["media-items", "random-picks", seed] as const,
    tagRow: (tag: string) => ["media-items", "tag-row", tag] as const,
  },
  /** One item's full detail, as the modal shows it. */
  mediaItem: {
    all: ["media-item"] as const,
    detail: (id: Id) => ["media-item", id] as const,
  },
  collectionItems: {
    all: ["collection-items"] as const,
    /** A collection's own grid (infinite query). */
    list: (collectionId: Id) => ["collection-items", collectionId] as const,
    /** A collection's row on the home page. */
    row: (collectionId: Id) => ["collection-items", "row", collectionId] as const,
  },
  collections: ["collections"] as const,
  continueWatching: ["continue-watching"] as const,
  heroItems: ["hero-items"] as const,
  onThisDay: ["on-this-day"] as const,
  forgottenGems: ["forgotten-gems"] as const,
  dailyPick: {
    all: ["daily-pick"] as const,
    forSeed: (seed: unknown) => ["daily-pick", seed] as const,
  },
  relatedItems: {
    all: ["related-items"] as const,
    forItem: (id: Id) => ["related-items", id] as const,
  },
  searchSuggestions: {
    all: ["search-suggestions"] as const,
    forQuery: (q: string) => ["search-suggestions", q] as const,
  },
  timeline: ["timeline"] as const,
  playSurface: {
    all: ["play-surface"] as const,
    list: (source: unknown, ids: readonly number[] | undefined) =>
      ["play-surface", source, ids] as const,
  },

  /** Per-item media the detail modal loads under the item's id. */
  gallery: (id: Id) => ["gallery", id] as const,
  bookmarks: (id: Id) => ["bookmarks", id] as const,
  heatmap: (id: Id) => ["heatmap", id] as const,
  scrubSprite: (id: Id) => ["scrub-sprite", id] as const,
  castLink: (id: Id) => ["cast-link", id] as const,

  performers: {
    all: ["performers"] as const,
    withArchived: ["performers", "with-archived"] as const,
    network: (mode: unknown) => ["performers", "network", mode] as const,
    sharedVideos: (a: string | undefined, b: string | undefined) =>
      ["performers", "shared-videos", a, b] as const,
    latestVideos: (name: string) => ["performers", "latest-videos", name] as const,
  },
  performer: {
    all: ["performer"] as const,
    detail: (id: Id) => ["performer", id] as const,
  },
  performerVideos: {
    all: ["performer-videos"] as const,
    list: (performer: unknown, params: unknown, sort: unknown) =>
      ["performer-videos", performer, params, sort] as const,
  },
  performerInProgress: {
    all: ["performer-in-progress"] as const,
    forPerformer: (id: Id) => ["performer-in-progress", id] as const,
  },
  tasteTwins: ["taste-twins"] as const,

  studios: {
    all: ["studios"] as const,
    videos: (name: string) => ["studios", "videos", name] as const,
  },
  studio: {
    all: ["studio"] as const,
    detail: (id: Id) => ["studio", id] as const,
  },
  albums: {
    all: ["albums"] as const,
    list: (performer: string | null, studio: string | null) =>
      ["albums", performer, studio] as const,
  },
  album: {
    all: ["album"] as const,
    detail: (id: Id) => ["album", id] as const,
  },
  /** ["series"] is both the index list and the prefix of every series page. */
  series: {
    all: ["series"] as const,
    detail: (id: Id) => ["series", id] as const,
  },
  tags: ["tags"] as const,
  categories: ["categories"] as const,
  folders: ["folders"] as const,

  /** The one cache key for `/api/stats` (footer, settings, stats page). */
  libraryStats: ["library-stats"] as const,
  libraryRoots: ["library-roots"] as const,
  libraryBrowse: {
    all: ["library-browse"] as const,
    dir: (dir: string) => ["library-browse", dir] as const,
  },
  libraryCleanup: ["library-cleanup"] as const,
  missingVideos: ["missing-videos"] as const,
  duplicates: ["duplicates"] as const,
  scanLatest: ["scan-latest"] as const,
  scanJob: (jobId: Id) => ["scan-job", jobId] as const,
  storageInsights: ["storage-insights"] as const,
  storageTreemap: (path: string) => ["storage-treemap", path] as const,
  cacheUsage: ["cache-usage"] as const,
  backups: ["backups"] as const,
  settings: ["settings"] as const,

  authStatus: ["auth-status"] as const,
  privacy: ["privacy"] as const,
  passkeys: ["passkeys"] as const,
  vault: ["vault"] as const,
  vaultItems: ["vault-items"] as const,

  inbox: {
    all: ["inbox"] as const,
    page: (page: number) => ["inbox", page] as const,
  },
  inboxCount: ["inbox-count"] as const,
  activity: {
    all: ["activity"] as const,
    byType: (type: unknown) => ["activity", type] as const,
  },
  achievements: ["achievements"] as const,
  insights: ["insights"] as const,
  streak: ["streak"] as const,
  funStat: ["fun-stat"] as const,
} as const;

/**
 * Everything cached under a single item's id, outside the lists: what the
 * detail modal loads when it opens. Used to forget a hidden item's traces.
 */
export function itemScopedKeys(id: Id) {
  return [
    qk.mediaItem.detail(id),
    qk.gallery(id),
    qk.bookmarks(id),
    qk.heatmap(id),
    qk.scrubSprite(id),
    qk.castLink(id),
  ] as const;
}
