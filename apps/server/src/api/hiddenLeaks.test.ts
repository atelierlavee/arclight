import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import {
  attachFile,
  linkPerformer,
  makeItem,
  makeLibraryAt,
  makePerformer,
  makeStudio,
} from "../test/fixtures.js";
import { db } from "../db/client.js";
import {
  appSettings,
  bookmarks,
  mediaItemPerformers,
  mediaItems,
  performers,
  watchLog,
} from "../db/schema.js";
import { hashPassword } from "../auth/passwords.js";
import { signCastToken } from "../auth/castTokens.js";
import { ITEM_THUMBNAILS_DIR } from "../media/cache.js";
import { resetVaultAttempts } from "./vault.js";

/**
 * A vault item must leave no trace anywhere a locked session can look.
 *
 * Each of these endpoints once spelled the visibility rule out by hand and
 * predated the vault, so each one leaked hidden items. The tests put one
 * visible and one hidden video side by side and check that only the visible
 * one shows — and that by-id routes answer 404 until the vault is opened.
 */

let app: FastifyInstance;
let cookie: string;

// The thumbnail tests write into the shared APP_DATA_DIR; left behind, they
// skew the upload byte counts other test files assert on.
afterAll(async () => {
  const names = await readdir(ITEM_THUMBNAILS_DIR).catch(() => [] as string[]);
  await Promise.all(
    names
      .filter((name) => name.startsWith("hidden-leaks-"))
      .map((name) => rm(path.join(ITEM_THUMBNAILS_DIR, name), { force: true })),
  );
});
let libraryId: number;
let rootId: number;
let dir: string;

beforeAll(async () => {
  app = await testApp();
});
beforeEach(async () => {
  await resetDatabase();
  resetVaultAttempts();
  cookie = await signIn();
  dir = await mkdtemp(path.join(tmpdir(), "hidden-leaks-"));
  ({ libraryId, rootId } = await makeLibraryAt(dir));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const get = (url: string, headers: Record<string, string> = {}) =>
  app.inject({ method: "GET", url, headers: { cookie, ...headers } });
const send = (method: "POST" | "PUT" | "DELETE", url: string, payload?: unknown) =>
  app.inject({ method, url, headers: { cookie }, payload: payload as object });

async function setPinAndLock(): Promise<void> {
  await send("PUT", "/api/vault/pin", { pin: "1234", accountPassword: "test-password" });
  await send("POST", "/api/vault/lock");
}
const unlockVault = () => send("POST", "/api/vault/unlock", { pin: "1234" });

/** One visible and one hidden video, sharing a studio, a performer and a hash. */
async function pair() {
  const studioId = await makeStudio("Acme");
  const performerId = await makePerformer("Pat");
  const shown = await makeItem(libraryId, { title: "Shown", studioId });
  const secret = await makeItem(libraryId, { title: "Secret", studioId, hiddenAt: new Date() });
  await attachFile(shown, rootId, path.join(dir, "shown.mp4"), "samehash", 1000);
  await attachFile(secret, rootId, path.join(dir, "secret.mp4"), "samehash", 999_999);
  await linkPerformer(shown, performerId);
  await linkPerformer(secret, performerId);
  return { studioId, performerId, shown, secret };
}

describe("hidden items stay out of aggregate views", () => {
  it("hero (recent source)", async () => {
    await pair();
    const titles = (await get("/api/hero-items")).json().items.map((i: { title: string }) => i.title);
    expect(titles).toEqual(["Shown"]);
  });

  it("insights: log, items, performer and studio counts", async () => {
    const { shown, secret } = await pair();
    const hour = new Date("2026-01-01T10:00:00Z");
    await db.insert(watchLog).values([
      { mediaItemId: shown, hour, seconds: 60 },
      { mediaItemId: secret, hour, seconds: 600 },
    ]);
    await db.insert(bookmarks).values({ mediaItemId: secret, positionSeconds: 5 });

    const body = (await get("/api/insights")).json();
    expect(body.log.map((e: { mediaItemId: number }) => e.mediaItemId)).toEqual([shown]);
    expect(body.items.map((i: { id: number }) => i.id)).toEqual([shown]);
    expect(body.performers[0]).toMatchObject({ videoCount: 1, representativeItemId: shown });
    expect(body.studios[0]).toMatchObject({ videoCount: 1 });
    expect(body.bookmarkCount).toBe(0);
  });

  it("streak sums visible watch time per hour", async () => {
    const { shown, secret } = await pair();
    const other = await makeItem(libraryId, { title: "Other" });
    const hour = new Date("2026-01-01T10:00:00Z");
    await db.insert(watchLog).values([
      { mediaItemId: shown, hour, seconds: 60 },
      { mediaItemId: other, hour, seconds: 30 },
      { mediaItemId: secret, hour, seconds: 600 },
    ]);
    expect((await get("/api/streak")).json()).toEqual({
      log: [{ hour: hour.toISOString(), seconds: 90 }],
    });
  });

  it("storage insights", async () => {
    await pair();
    const body = (await get("/api/storage/insights")).json();
    expect(body.totals.videos).toMatchObject({ items: 1, bytes: 1000 });
    expect(body.largest.map((i: { title: string }) => i.title)).toEqual(["Shown"]);
    expect(body.byStudio[0]).toMatchObject({ items: 1, bytes: 1000 });
    expect(body.byPerformer[0]).toMatchObject({ items: 1, bytes: 1000 });
    const tree = (await get("/api/storage/treemap")).json();
    expect(tree.totalBytes).toBe(1000);
  });

  it("performer and studio counts and pictures", async () => {
    const { shown, performerId, studioId } = await pair();
    const list = (await get("/api/performers")).json().performers;
    expect(list[0]).toMatchObject({ videoCount: 1, representativeItemId: shown });

    const profile = (await get(`/api/performers/${performerId}`)).json();
    expect(profile.videoCount).toBe(1);

    const network = (await get("/api/performers/network")).json();
    expect(network.nodes[0]).toMatchObject({ videoCount: 1, representativeItemId: shown });

    const studios = (await get("/api/studios")).json().studios;
    expect(studios[0].videoCount).toBe(1);
    const studio = (await get(`/api/studios/${studioId}`)).json();
    expect(JSON.stringify(studio)).not.toContain("Secret");
  });

  it("duplicates list and the health count", async () => {
    await pair();
    // Two visible copies make a group; the hidden third must not join it.
    const copy = await makeItem(libraryId, { title: "Copy" });
    await attachFile(copy, rootId, path.join(dir, "copy.mp4"), "samehash", 1000);

    const body = (await get("/api/library/duplicates")).json();
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].files.map((f: { title: string }) => f.title).sort()).toEqual(["Copy", "Shown"]);
    expect((await get("/api/stats")).json()).toMatchObject({ videoDuplicateGroups: 1, videos: 2 });
  });

  it("taste twins and fun stats ignore what was watched in the vault", async () => {
    const { secret } = await pair();
    const twin = await makePerformer("Twin");
    await linkPerformer(secret, twin);
    await db.insert(watchLog).values({ mediaItemId: secret, hour: new Date(), seconds: 600 });
    expect((await get("/api/taste-twins")).json()).toEqual({ performers: [] });
  });
});

describe("a hidden item by id", () => {
  async function hiddenWithFile() {
    const id = await makeItem(libraryId, { title: "Secret", hiddenAt: new Date() });
    const file = path.join(dir, "secret.mp4");
    await writeFile(file, "0123456789");
    await attachFile(id, rootId, file);
    return id;
  }

  it("404s for detail, related, gallery, bookmarks, stream and cast while locked", async () => {
    await setPinAndLock();
    const id = await hiddenWithFile();
    for (const url of [
      `/api/media-items/${id}`,
      `/api/media-items/${id}/related`,
      `/api/media-items/${id}/gallery`,
      `/api/media-items/${id}/bookmarks`,
      `/api/media-items/${id}/cast`,
      `/api/media-items/${id}/thumbnail`,
      `/api/stream/${id}`,
    ]) {
      expect((await get(url)).statusCode, url).toBe(404);
    }
  });

  it("opens once the vault is unlocked, and is never cached", async () => {
    await setPinAndLock();
    const id = await hiddenWithFile();
    await unlockVault();

    expect((await get(`/api/media-items/${id}`)).statusCode).toBe(200);
    expect((await get(`/api/media-items/${id}/bookmarks`)).statusCode).toBe(200);
    const stream = await get(`/api/stream/${id}`);
    expect([200, 206]).toContain(stream.statusCode);
    expect(stream.headers["cache-control"]).toBe("private, no-store");
  });

  it("serves a thumbnail only with the vault open, privately", async () => {
    await setPinAndLock();
    const id = await hiddenWithFile();
    await mkdir(ITEM_THUMBNAILS_DIR, { recursive: true });
    const name = `hidden-leaks-${id}.jpg`;
    await writeFile(path.join(ITEM_THUMBNAILS_DIR, name), "jpeg");
    await db.update(mediaItems).set({ thumbnailFile: name }).where(eq(mediaItems.id, id));

    expect((await get(`/api/media-items/${id}/thumbnail`)).statusCode).toBe(404);
    await unlockVault();
    const res = await get(`/api/media-items/${id}/thumbnail`);
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
  });

  it("a visible thumbnail is cached privately, never publicly", async () => {
    const id = await makeItem(libraryId, { title: "Shown" });
    await attachFile(id, rootId, path.join(dir, "shown.mp4"));
    await mkdir(ITEM_THUMBNAILS_DIR, { recursive: true });
    const name = `hidden-leaks-visible-${id}.jpg`;
    await writeFile(path.join(ITEM_THUMBNAILS_DIR, name), "jpeg");
    await db.update(mediaItems).set({ thumbnailFile: name }).where(eq(mediaItems.id, id));

    const res = await get(`/api/media-items/${id}/thumbnail`);
    expect(res.headers["cache-control"]).toBe("private, max-age=31536000, immutable");
  });

  it("a cast token issued while unlocked streams without a session", async () => {
    await setPinAndLock();
    const id = await hiddenWithFile();
    await unlockVault();
    const cast = await get(`/api/media-items/${id}/cast`);
    expect(cast.statusCode).toBe(200);

    const res = await app.inject({ url: `/api/stream/${id}?cast=${signCastToken(id)}` });
    expect([200, 206]).toContain(res.statusCode);
  });
});

describe("destructive routes need the privacy credential", () => {
  beforeEach(async () => {
    await db.insert(appSettings).values({
      key: "privacy",
      value: { passwordHash: await hashPassword("correct horse") },
    });
  });

  it("performer delete is refused while locked, and works once unlocked", async () => {
    const performerId = await makePerformer("Pat");
    const item = await makeItem(libraryId);
    await linkPerformer(item, performerId);

    const locked = await send("DELETE", `/api/performers/${performerId}`);
    expect(locked.statusCode).toBe(403);
    expect(locked.json().code).toBe("privacy_locked");
    expect(await db.select().from(performers)).toHaveLength(1);

    await send("POST", "/api/privacy/unlock", { password: "correct horse" });
    const res = await send("DELETE", `/api/performers/${performerId}`);
    expect(res.json()).toEqual({ ok: true, unlinkedCount: 1 });
    expect(await db.select().from(performers)).toHaveLength(0);
    expect(await db.select().from(mediaItemPerformers)).toHaveLength(0);
  });

  it("cleanup and a data-deleting folder removal are refused while locked", async () => {
    expect((await send("POST", "/api/library/cleanup")).statusCode).toBe(403);
    const res = await send("DELETE", `/api/library/roots/${rootId}?deleteData=true`);
    expect(res.statusCode).toBe(403);
    expect((await get("/api/library/roots")).json().roots).toHaveLength(1);
  });
});

describe("GET /api/library/roots file counts", () => {
  it("treats % and _ in a folder name literally", async () => {
    const pct = path.join(dir, "100%");
    const { rootId: pctRoot } = await makeLibraryAt(pct);
    // Under the "100%" root by LIKE's reading ("100" then anything), not by path.
    const a = await makeItem(libraryId);
    await attachFile(a, rootId, path.join(dir, "100abc", "x.mp4"));
    const b = await makeItem(libraryId);
    await attachFile(b, pctRoot, path.join(pct, "y.mp4"));

    const roots = (await get("/api/library/roots")).json().roots as { id: number; files: number }[];
    expect(roots.find((r) => r.id === pctRoot)?.files).toBe(1);
    expect(roots.find((r) => r.id === rootId)?.files).toBe(2);
  });
});
