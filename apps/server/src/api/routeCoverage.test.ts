import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import {
  registeredRoutes,
  resetDatabase,
  signIn,
  testApp,
  type RegisteredRoute,
} from "../test/harness.js";
import {
  attachFile,
  linkPerformer,
  linkTag,
  makeItem,
  makeLibraryAt,
  makePerformer,
  makePhoto,
  makeStudio,
  makeTag,
} from "../test/fixtures.js";
import { db } from "../db/client.js";
import {
  activityEvents,
  albums,
  appSettings,
  bookmarks,
  collectionItems,
  collections,
  mediaItems,
  playbackHeatmap,
  playbackStates,
  scanJobs,
  series,
  watchLog,
} from "../db/schema.js";
import { hashPassword } from "../auth/passwords.js";
import { PUBLIC_API_PATHS } from "../auth/guard.js";
import { resetVaultAttempts } from "./vault.js";

/**
 * Rules every route has to follow, checked against every route that exists.
 *
 * The per-feature tests (hiddenLeaks, guard, backups...) pin the bugs that
 * were found. These sweep the route table instead, so a route added next
 * month that forgets the session check, leaks a vault item or deletes without
 * the privacy credential fails here even though nobody wrote a test for it.
 * Where a route is deliberately different, it is named below with the reason
 * — so making an exception is a decision someone writes down, not an
 * accident nobody notices.
 */

let app: FastifyInstance;
let routes: RegisteredRoute[];

beforeAll(async () => {
  app = await testApp();
  routes = (await registeredRoutes()).filter((r) => r.url.startsWith("/api"));
});

const key = (r: RegisteredRoute) => `${r.method} ${r.url}`;

/** Plausible values for a route's params — enough to reach the router's match. */
function fillParams(url: string, values: Record<string, string> = {}): string {
  return url
    .replace(/:(\w+)/g, (_, name: string) => values[name] ?? PLACEHOLDER[name] ?? "1")
    .replace(/\*$/, "index.html");
}
const PLACEHOLDER: Record<string, string> = {
  name: "arc-light-backup.tar.gz",
  slug: "video",
  kind: "video",
};

// ---------------------------------------------------------------------------
// 1. Authentication
// ---------------------------------------------------------------------------

/**
 * The routes an anonymous visitor may reach. Repeated here rather than read
 * back from the guard so that making a route public takes two edits — the
 * guard and this list — and the second one is in a file a reviewer reads.
 */
const EXPECTED_PUBLIC = [
  "/api/auth/status",
  "/api/auth/setup",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/webauthn/login/options",
  "/api/webauthn/login",
  "/api/health",
];

describe("every /api route needs a session", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  it("the public allow-list is exactly the expected one", () => {
    expect([...PUBLIC_API_PATHS].sort()).toEqual([...EXPECTED_PUBLIC].sort());
  });

  it("every public entry names a route that exists", () => {
    const urls = new Set(routes.map((r) => r.url));
    for (const url of EXPECTED_PUBLIC) expect(urls.has(url), url).toBe(true);
  });

  it("collected a plausible number of routes", () => {
    // Guards against the hook silently collecting nothing, which would make
    // every sweep below pass vacuously.
    expect(routes.length).toBeGreaterThan(100);
  });

  it("refuses every non-public route without a session, in plain and encoded spellings", async () => {
    const failures: string[] = [];
    for (const route of routes) {
      if (PUBLIC_API_PATHS.has(route.url)) continue;
      const url = fillParams(route.url);
      for (const spelling of [url, url.replace(/^\/api/, "/%61pi")]) {
        const res = await app.inject({
          method: route.method as "GET",
          url: spelling,
          ...(["POST", "PUT", "PATCH"].includes(route.method) ? { payload: {} } : {}),
        });
        if (res.statusCode !== 401) failures.push(`${route.method} ${spelling} -> ${res.statusCode}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Vault items stay out of every GET while the vault is locked
// ---------------------------------------------------------------------------

/**
 * Hidden items get ids far from anything a count, size or other row's id
 * will produce, so finding one of these numbers anywhere in a response is a
 * leak rather than a coincidence.
 */
const HIDDEN_VIDEO_ID = 987654;
const HIDDEN_MISSING_ID = 987655;
const HIDDEN_PHOTO_ID = 987656;
const HIDDEN_IDS = [HIDDEN_VIDEO_ID, HIDDEN_MISSING_ID, HIDDEN_PHOTO_ID];
const SENTINEL = "ZZ-HIDDEN-SENTINEL";

/**
 * GET routes that may show a hidden item to a session whose vault is locked.
 * Deliberately empty: nothing should. A route belongs here only with a
 * comment saying why its caller is entitled to see vault contents.
 */
const MAY_EXPOSE_HIDDEN = new Set<string>([]);

type Seeded = {
  dir: string;
  visibleId: number;
  visiblePhotoId: number;
  performerId: number;
  studioId: number;
  tagId: number;
  collectionId: number;
  seriesId: number;
  albumId: number;
  scanId: number;
};

/**
 * One visible and one hidden of everything a hidden item can be attached to:
 * a studio, performer, tag, series, album, collection, file (with a
 * duplicate hash), playback, watch history, heatmap, bookmark and activity —
 * every place stats, insights, discovery or storage could count it from.
 */
async function seedLibrary(): Promise<Seeded> {
  const dir = await mkdtemp(path.join(tmpdir(), "route-coverage-"));
  const { libraryId, rootId } = await makeLibraryAt(dir);
  const studioId = await makeStudio("Shared Studio");
  const performerId = await makePerformer("Shared Performer");
  const tagId = await makeTag("shared-tag");
  const [s] = await db.insert(series).values({ libraryId, name: "Shared Series" }).returning();
  const [album] = await db
    .insert(albums)
    .values({ path: path.join(dir, "album"), title: "Shared Album", performerId, studioId })
    .returning();
  const [collection] = await db
    .insert(collections)
    .values({ name: "Shared Collection", type: "manual" })
    .returning();

  const lastYear = new Date();
  lastYear.setFullYear(lastYear.getFullYear() - 1);
  const shared = {
    studioId,
    seriesId: s.id,
    isFavorite: true,
    rating: 5,
    durationSeconds: 600,
    releaseDate: lastYear.toISOString().slice(0, 10),
    takenAt: lastYear,
    createdAt: lastYear,
  };

  const visibleId = await makeItem(libraryId, { ...shared, title: "Visible Video" });
  await makeItem(libraryId, {
    ...shared,
    id: HIDDEN_VIDEO_ID,
    title: SENTINEL,
    description: `${SENTINEL} description`,
    hiddenAt: new Date(),
  });
  await makeItem(libraryId, {
    ...shared,
    id: HIDDEN_MISSING_ID,
    title: `${SENTINEL} missing`,
    hiddenAt: new Date(),
    missingSince: new Date(),
  });
  const visiblePhotoId = await makePhoto(libraryId, "Visible Photo");
  const [{ itemTypeId: photoType }] = await db
    .select({ itemTypeId: mediaItems.itemTypeId })
    .from(mediaItems)
    .where(eq(mediaItems.id, visiblePhotoId));
  await makeItem(libraryId, {
    id: HIDDEN_PHOTO_ID,
    itemTypeId: photoType,
    title: `${SENTINEL} photo`,
    kind: "photo",
    hiddenAt: new Date(),
  });
  await db
    .update(mediaItems)
    .set({ albumId: album.id, takenAt: lastYear, kind: "photo" })
    .where(inArray(mediaItems.id, [visiblePhotoId, HIDDEN_PHOTO_ID]));

  const all = [visibleId, ...HIDDEN_IDS];
  const videos = [visibleId, HIDDEN_VIDEO_ID, HIDDEN_MISSING_ID];
  // Real bytes behind each, so streams and previews have something to serve.
  for (const id of all) {
    const file = path.join(dir, `${id === visibleId ? "visible" : `${SENTINEL}-${id}`}.mp4`);
    await writeFile(file, "0123456789");
    await attachFile(id, rootId, file, "same-hash", 1000 + id);
  }
  await attachFile(visiblePhotoId, rootId, path.join(dir, "album", "visible.jpg"), null, 500);

  for (const id of [...all, visiblePhotoId]) {
    await linkPerformer(id, performerId);
    await linkTag(id, tagId);
  }
  // A performer whose only video is hidden: still listed (performers are not
  // vault items), but it must not point at that video.
  const loner = await makePerformer("Lonely Performer");
  await linkPerformer(HIDDEN_VIDEO_ID, loner);

  const hour = new Date();
  hour.setMinutes(0, 0, 0);
  await db.insert(collectionItems).values(
    all.map((mediaItemId, position) => ({ collectionId: collection.id, mediaItemId, position })),
  );
  // Two in progress (continue watching); the missing one finished a year ago
  // today, for the history views that keep missing items (on this day etc.).
  await db.insert(playbackStates).values(
    videos.map((mediaItemId) =>
      mediaItemId === HIDDEN_MISSING_ID
        ? { mediaItemId, playCount: 3, completedAt: lastYear }
        : { mediaItemId, positionSeconds: 120, playCount: 3 },
    ),
  );
  await db.insert(watchLog).values([
    ...videos.map((mediaItemId) => ({ mediaItemId, hour, seconds: 300 })),
    ...videos.map((mediaItemId) => ({ mediaItemId, hour: lastYear, seconds: 300 })),
  ]);
  await db.insert(playbackHeatmap).values(videos.map((mediaItemId) => ({ mediaItemId, bucket: 1 })));
  await db.insert(bookmarks).values(
    videos.map((mediaItemId) => ({
      mediaItemId,
      positionSeconds: 30,
      label: mediaItemId === visibleId ? "Visible mark" : `${SENTINEL} mark`,
    })),
  );
  await db.insert(activityEvents).values(
    videos.map((mediaItemId) => ({
      type: "playback",
      message: mediaItemId === visibleId ? "Watched Visible Video" : `Watched ${SENTINEL}`,
      mediaItemId,
    })),
  );
  const [scan] = await db.insert(scanJobs).values({ status: "completed" }).returning();

  return {
    dir,
    visibleId,
    visiblePhotoId,
    performerId,
    studioId,
    tagId,
    collectionId: collection.id,
    seriesId: s.id,
    albumId: album.id,
    scanId: scan.id,
  };
}

/**
 * Which URL to sweep each parameterised GET with, or null with a reason to
 * skip it. Every parameterised GET has to be listed: a new one fails the
 * "is classified" test until someone decides what it should be called with.
 */
function parameterisedGets(s: Seeded): Record<string, string | null> {
  const item = (suffix = "") => `/api/media-items/${s.visibleId}${suffix}`;
  return {
    "/api/media-items/:id": item(),
    "/api/media-items/:id/bookmarks": item("/bookmarks"),
    "/api/media-items/:id/cast": item("/cast"),
    "/api/media-items/:id/gallery": `/api/media-items/${s.visiblePhotoId}/gallery`,
    "/api/media-items/:id/heatmap": item("/heatmap"),
    "/api/media-items/:id/preview": item("/preview"),
    "/api/media-items/:id/related": item("/related"),
    "/api/media-items/:id/scrub": item("/scrub"),
    "/api/media-items/:id/scrub.jpg": item("/scrub.jpg"),
    "/api/media-items/:id/thumbnail": item("/thumbnail"),
    "/api/stream/:itemId": `/api/stream/${s.visibleId}`,
    "/api/performers/:id": `/api/performers/${s.performerId}`,
    "/api/performers/:id/image": `/api/performers/${s.performerId}/image`,
    "/api/studios/:id": `/api/studios/${s.studioId}`,
    "/api/series/:id": `/api/series/${s.seriesId}`,
    "/api/albums/:id": `/api/albums/${s.albumId}`,
    "/api/collections/:id/items": `/api/collections/${s.collectionId}/items`,
    "/api/scan/:id": `/api/scan/${s.scanId}`,
    "/api/categories/:slug/cover": "/api/categories/video/cover",
    "/api/kinds/:kind/cover": "/api/kinds/video/cover",
    // An archive of the whole database, vault included, by design — that is
    // what a backup is. Behind the privacy credential instead (see below).
    "/api/backups/:name": null,
    // Swagger UI's static assets; no library data.
    "/api/docs/static/*": null,
  };
}

/** Extra spellings of parameterless GETs, for filters that take a different path. */
function queryVariants(s: Seeded): string[] {
  return [
    "/api/media-items?q=SENTINEL",
    "/api/media-items?favorite=true",
    "/api/media-items?type=photo",
    "/api/media-items?kind=photo",
    "/api/media-items?sort=random",
    "/api/media-items?minRating=1",
    "/api/media-items?performer=Shared%20Performer",
    "/api/media-items?studio=Shared%20Studio",
    `/api/media-items?tag=shared-tag`,
    `/api/media-items?parentId=${s.visibleId}`,
    "/api/search/suggestions?q=SENTINEL",
    "/api/search/suggestions?q=Shared",
    "/api/performers?archived=true",
    "/api/performers/network?by=studio",
    `/api/albums?performer=${s.performerId}`,
    `/api/albums?studio=${s.studioId}`,
    "/api/activity?type=playback",
    `/api/storage/treemap?path=${encodeURIComponent(s.dir)}`,
  ];
}

/** Why a response gives a hidden item away, or null if it doesn't. */
function leak(body: string): string | null {
  if (body.toLowerCase().includes(SENTINEL.toLowerCase())) return `contains ${SENTINEL}`;
  for (const id of HIDDEN_IDS) {
    if (new RegExp(`\\b${id}\\b`).test(body)) return `contains hidden id ${id}`;
  }
  return null;
}

describe("a locked vault leaves no trace in any GET", () => {
  let seeded: Seeded;
  let cookie: string;
  const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });

  beforeEach(async () => {
    await resetDatabase();
    resetVaultAttempts();
    cookie = await signIn();
    seeded = await seedLibrary();
    // A PIN makes the vault real; setting it opens it, so close it again.
    const pin = await app.inject({
      method: "PUT",
      url: "/api/vault/pin",
      headers: { cookie },
      payload: { pin: "1234", accountPassword: "test-password" },
    });
    expect(pin.statusCode).toBe(200);
    await app.inject({ method: "POST", url: "/api/vault/lock", headers: { cookie } });
  });
  afterEach(async () => {
    await rm(seeded.dir, { recursive: true, force: true });
  });

  it("every parameterised GET is classified", () => {
    const known = parameterisedGets(seeded);
    const unclassified = routes
      .filter((r) => r.method === "GET" && /[:*]/.test(r.url) && !(r.url in known))
      .map(key);
    expect(unclassified).toEqual([]);
  });

  it("no GET mentions a hidden item", async () => {
    const known = parameterisedGets(seeded);
    const urls = [
      ...routes
        .filter((r) => r.method === "GET" && !MAY_EXPOSE_HIDDEN.has(r.url))
        .map((r) => (/[:*]/.test(r.url) ? known[r.url] : r.url))
        .filter((url): url is string => typeof url === "string"),
      ...queryVariants(seeded),
    ];

    const leaks: string[] = [];
    let ok = 0;
    for (const url of urls) {
      const res = await get(url);
      if (res.statusCode === 200) ok++;
      const why = leak(res.body);
      if (why) leaks.push(`${url} (${res.statusCode}) ${why}`);
    }
    expect(leaks).toEqual([]);
    // Most of them answered for real — a sweep of 401s and 500s proves nothing.
    expect(ok).toBeGreaterThan(urls.length * 0.75);
  });

  it("every by-id GET on a media item answers 404 for a hidden id", async () => {
    const byId = routes.filter(
      (r) =>
        r.method === "GET" &&
        (r.url.startsWith("/api/media-items/:id") || r.url.startsWith("/api/stream/:itemId")),
    );
    expect(byId.length).toBeGreaterThan(5);
    const wrong: string[] = [];
    for (const route of byId) {
      for (const id of HIDDEN_IDS) {
        const url = fillParams(route.url, { id: String(id), itemId: String(id) });
        const res = await get(url);
        if (res.statusCode !== 404) wrong.push(`${url} -> ${res.statusCode}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("is not vacuous: an unlocked vault does show the hidden item", async () => {
    const unlock = await app.inject({
      method: "POST",
      url: "/api/vault/unlock",
      headers: { cookie },
      payload: { pin: "1234" },
    });
    expect(unlock.statusCode).toBe(200);
    const vault = await get("/api/vault/items");
    expect(vault.statusCode).toBe(200);
    expect(vault.body).toContain(SENTINEL);
    expect(vault.body).toContain(String(HIDDEN_VIDEO_ID));
    expect((await get(`/api/media-items/${HIDDEN_VIDEO_ID}`)).statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 3. Destructive routes need the privacy credential
// ---------------------------------------------------------------------------

/**
 * Every DELETE route, sorted into the two answers it can have. A new DELETE
 * fails "is classified" until it is put in one of them.
 *
 * `gated` gives the request to send — a query string where only one form of
 * the route destroys anything.
 */
const GATED_DELETES: Record<string, string> = {
  "/api/activity": "/api/activity",
  "/api/backups/:name": "/api/backups/arc-light-backup.tar.gz",
  "/api/performers/:id": "/api/performers/1",
  // Purging a folder's records; removing the folder alone is reversible
  // (its items come back when it is re-added), see the allow-list.
  "/api/library/roots/:id": "/api/library/roots/1?deleteData=true",
  // A passkey is a privacy credential. Removing the last one switches the
  // privacy gate off for every route in this list, so it needs proving too.
  "/api/webauthn/credentials/:id": "/api/webauthn/credentials/abc",
};

/** DELETEs that need no privacy credential, each with why. */
const UNGATED_DELETES: Record<string, string> = {
  "/api/bookmarks/:id": "one bookmark the user made; no library record or history goes",
  "/api/collections/:id": "a hand-made grouping; the items themselves are untouched",
  "/api/collections/:id/items/:mediaItemId": "takes an item out of a collection, not the library",
  "/api/categories/:id": "a home-page label; its items move to another category, none are deleted",
  "/api/categories/:slug/cover": "custom artwork; falls back to the automatic cover",
  "/api/kinds/:kind/cover": "custom artwork; falls back to the automatic cover",
  "/api/performers/:id/image": "custom artwork; the performer and their links stay",
  "/api/media-items/:id/thumbnail": "custom artwork; falls back to the generated thumbnail",
  "/api/continue-watching":
    "resets resume positions only; play counts and completion are kept (see playback.ts)",
};

/** Non-DELETE routes that destroy or hand out the whole library. */
const GATED_OTHERS: { method: "GET" | "POST"; url: string; payload?: object }[] = [
  { method: "POST", url: "/api/backups/arc-light-backup.tar.gz/restore" },
  { method: "GET", url: "/api/backups/arc-light-backup.tar.gz" },
  { method: "POST", url: "/api/library/cleanup" },
  { method: "GET", url: "/api/missing" },
  { method: "POST", url: "/api/missing/forget", payload: { ids: [1] } },
  { method: "POST", url: "/api/missing/forget-all" },
];

describe("destructive routes need the privacy credential", () => {
  let cookie: string;

  beforeEach(async () => {
    await resetDatabase();
    cookie = await signIn();
    await db.insert(appSettings).values({
      key: "privacy",
      value: { passwordHash: await hashPassword("correct horse") },
    });
  });

  it("every DELETE route is classified", () => {
    const deletes = routes.filter((r) => r.method === "DELETE").map((r) => r.url);
    const unclassified = deletes.filter((u) => !(u in GATED_DELETES) && !(u in UNGATED_DELETES));
    expect(unclassified).toEqual([]);
    // And no stale entries: a classification for a route that is gone hides
    // nothing today, but would silently cover a different route later.
    const stale = [...Object.keys(GATED_DELETES), ...Object.keys(UNGATED_DELETES)].filter(
      (u) => !deletes.includes(u),
    );
    expect(stale).toEqual([]);
  });

  it("refuses every gated route while privacy is locked", async () => {
    const requests = [
      ...Object.values(GATED_DELETES).map((url) => ({ method: "DELETE" as const, url })),
      ...GATED_OTHERS,
    ];
    const wrong: string[] = [];
    for (const { method, url, ...rest } of requests) {
      const res = await app.inject({
        method,
        url,
        headers: { cookie },
        ...("payload" in rest ? { payload: rest.payload } : {}),
      });
      const code = res.statusCode === 403 ? res.json().code : undefined;
      if (code !== "privacy_locked") wrong.push(`${method} ${url} -> ${res.statusCode} ${res.body}`);
    }
    expect(wrong).toEqual([]);
  });

  it("lets them through once unlocked — so the 403s above are the gate", async () => {
    const unlock = await app.inject({
      method: "POST",
      url: "/api/privacy/unlock",
      headers: { cookie },
      payload: { password: "correct horse" },
    });
    expect(unlock.statusCode).toBe(200);
    for (const url of ["/api/activity", "/api/webauthn/credentials/abc"]) {
      const res = await app.inject({ method: "DELETE", url, headers: { cookie } });
      expect(res.statusCode, url).toBe(200);
    }
  });
});
