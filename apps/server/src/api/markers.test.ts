import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { resetDatabase, signIn, signInOtherProfile, testApp } from "../test/harness.js";
import { makeItem, makeLibrary, makeStudio } from "../test/fixtures.js";
import { deleteItems } from "../library/forget.js";
import { db } from "../db/client.js";
import { mediaItemMarkers, mediaItems } from "../db/schema.js";
import { fetchAllSettled, fitMarkers, setFetchAllGap } from "./markers.js";
import { searchTpdbScenes } from "../metadata/tpdb.js";

let app: FastifyInstance;
let cookie: string;
let libraryId: number;

beforeAll(async () => {
  app = await testApp();
  setFetchAllGap(0);
});
beforeEach(async () => {
  await resetDatabase();
  cookie = await signIn();
  ({ libraryId } = await makeLibrary());
  process.env.TPDB_API_KEY = "test-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TPDB_API_KEY;
});

const request = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object, as = cookie) =>
  app.inject({ method, url, headers: { cookie: as }, payload });

type FakeScene = {
  id: string;
  title: string;
  date: string;
  site: { name: string; network?: { name: string } | null };
  markers?: { title: string; start_time: number | null; end_time: number | null }[];
};

/** Stands in for ThePornDB: search answers with every scene, detail by id. */
function fakeTpdb(scenes: FakeScene[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      const detail = url.match(/\/scenes\/([^?]+)$/);
      const body = detail
        ? { data: scenes.find((s) => s.id === decodeURIComponent(detail[1])) }
        : { data: scenes.map(({ markers: _markers, ...rest }) => rest) };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  return calls;
}

const mainEvent: FakeScene = {
  id: "scene-1",
  title: "Main Event",
  date: "2020-02-13",
  site: { name: "Blacked Raw", network: { name: "Vixen Media Group" } },
  markers: [
    { title: "Missionary", start_time: 921, end_time: null },
    { title: "Blowjob", start_time: 519, end_time: 600 },
    { title: "Past the end", start_time: 5000, end_time: null },
    { title: "", start_time: 10, end_time: null },
  ],
};

async function videoAt(studio: string, date: string, title = "Main Event") {
  const studioId = await makeStudio(studio);
  return makeItem(libraryId, { title, studioId, releaseDate: date, durationSeconds: 2288 });
}

describe("fitMarkers", () => {
  it("drops markers past the end, clamps ends and turns a backwards end into none", () => {
    expect(
      fitMarkers(
        [
          { title: "A", startSeconds: 10, endSeconds: 5 },
          { title: "B", startSeconds: 50, endSeconds: 999 },
          { title: "C", startSeconds: 200, endSeconds: null },
        ],
        100,
      ),
    ).toEqual([
      { title: "A", startSeconds: 10, endSeconds: null },
      { title: "B", startSeconds: 50, endSeconds: 100 },
    ]);
  });
});

describe("searchTpdbScenes", () => {
  it("is confident only about one scene on the same date from the same studio or network", async () => {
    fakeTpdb([mainEvent, { ...mainEvent, id: "other", date: "2021-01-01" }]);
    const query = { studio: "BlackedRaw", date: "2020-02-13", title: "Main Event" };
    expect((await searchTpdbScenes("k", query)).confidentId).toBe("scene-1");
    expect((await searchTpdbScenes("k", { ...query, studio: "Vixen Media Group" })).confidentId).toBe("scene-1");
    expect((await searchTpdbScenes("k", { ...query, studio: "Tushy" })).confidentId).toBeNull();
    expect((await searchTpdbScenes("k", { ...query, date: null })).confidentId).toBeNull();
  });

  it("is not confident when two scenes fit", async () => {
    fakeTpdb([mainEvent, { ...mainEvent, id: "twin" }]);
    const found = await searchTpdbScenes("k", { studio: "Blacked Raw", date: "2020-02-13", title: "x" });
    expect(found.confidentId).toBeNull();
    expect(found.candidates).toHaveLength(2);
  });
});

describe("markers", () => {
  it("fetches a scene's markers, replacing earlier fetched ones and keeping hand-made ones", async () => {
    fakeTpdb([mainEvent]);
    const id = await videoAt("Blacked Raw", "2020-02-13");

    const manual = await request("POST", `/api/media-items/${id}/markers`, { title: " Intro ", startSeconds: 0 });
    expect(manual.statusCode).toBe(201);

    expect((await request("POST", `/api/media-items/${id}/tpdb-markers`, { sceneId: "scene-1" })).json()).toEqual({ count: 2 });
    // A second fetch replaces, rather than adds to, the first.
    await request("POST", `/api/media-items/${id}/tpdb-markers`, { sceneId: "scene-1" });

    const list = (await request("GET", `/api/media-items/${id}/markers`)).json();
    expect(list.tpdbSceneId).toBe("scene-1");
    expect(list.markers.map((m: { title: string }) => m.title)).toEqual(["Intro", "Blowjob", "Missionary"]);
    expect(list.markers[1]).toMatchObject({ startSeconds: 519, endSeconds: 600, source: "tpdb" });
  });

  it("makes an edited marker the owner's, and deletes", async () => {
    const id = await videoAt("Studio", "2020-01-01");
    const [fetched] = await db
      .insert(mediaItemMarkers)
      .values({ mediaItemId: id, title: "Doggystyle", startSeconds: 100, source: "tpdb" })
      .returning();
    const edited = await request("PATCH", `/api/markers/${fetched.id}`, { endSeconds: 9999 });
    expect(edited.json()).toMatchObject({ endSeconds: 2288, source: "manual" });
    expect((await request("PATCH", `/api/markers/${fetched.id}`, { title: "  " })).statusCode).toBe(400);
    expect((await request("DELETE", `/api/markers/${fetched.id}`)).statusCode).toBe(200);
    expect((await request("DELETE", `/api/markers/${fetched.id}`)).statusCode).toBe(404);
  });

  it("lets every profile read markers but only the owner change them", async () => {
    const id = await videoAt("Studio", "2020-01-01");
    await request("POST", `/api/media-items/${id}/markers`, { title: "Missionary", startSeconds: 10 });
    const guest = await signInOtherProfile("Guest");
    expect((await request("GET", `/api/media-items/${id}/markers`, undefined, guest.cookie)).json().markers).toHaveLength(1);
    expect((await request("POST", `/api/media-items/${id}/markers`, { title: "X", startSeconds: 1 }, guest.cookie)).statusCode).toBe(403);
    expect((await request("GET", `/api/tpdb/match/${id}`, undefined, guest.cookie)).statusCode).toBe(403);
  });

  it("hides a vault item's markers", async () => {
    const id = await makeItem(libraryId, { hiddenAt: new Date() });
    await db.insert(mediaItemMarkers).values({ mediaItemId: id, title: "Secret", startSeconds: 1, source: "manual" });
    expect((await request("GET", `/api/media-items/${id}/markers`)).statusCode).toBe(404);
    expect((await request("GET", "/api/markers/names")).json().names).toEqual([]);
    expect((await request("GET", "/api/markers?name=secret")).json().markers).toEqual([]);
  });

  it("groups spellings of one position across the library", async () => {
    const a = await videoAt("Studio A", "2020-01-01");
    const b = await videoAt("Studio B", "2021-01-01");
    await db.insert(mediaItemMarkers).values([
      { mediaItemId: a, title: "Standing Doggystyle", startSeconds: 10, source: "tpdb" },
      { mediaItemId: a, title: "Standing Doggystyle", startSeconds: 90, source: "tpdb" },
      { mediaItemId: b, title: "Standing Doggy Style", startSeconds: 20, source: "tpdb" },
      { mediaItemId: b, title: "Blowjob", startSeconds: 5, source: "tpdb" },
    ]);
    const names = (await request("GET", "/api/markers/names")).json().names;
    expect(names[0]).toMatchObject({ key: "standingdoggystyle", name: "Standing Doggystyle", markers: 3, videos: 2 });
    const list = (await request("GET", "/api/markers?name=standing%20doggy%20style")).json();
    expect(list.markers).toHaveLength(3);
    expect(list.markers[0]).toMatchObject({ studio: expect.any(String), item: { id: expect.any(Number) } });
    expect((await request("GET", "/api/markers")).statusCode).toBe(400);
  });

  it("goes when its video is deleted", async () => {
    const id = await videoAt("Studio", "2020-01-01");
    await request("POST", `/api/media-items/${id}/markers`, { title: "Missionary", startSeconds: 10 });
    await deleteItems([id]);
    expect(await db.select().from(mediaItemMarkers)).toEqual([]);
  });

  it("explains a missing key", async () => {
    delete process.env.TPDB_API_KEY;
    const id = await videoAt("Studio", "2020-01-01");
    const res = await request("GET", `/api/tpdb/match/${id}`);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("TPDB_API_KEY");
  });
});

describe("library-wide fetch", () => {
  it("takes confident matches, records every video it checked, and skips them next time", async () => {
    const calls = fakeTpdb([mainEvent]);
    const matched = await videoAt("Blacked Raw", "2020-02-13");
    const unmatched = await videoAt("Someone Else", "2020-02-13");
    await makeItem(libraryId, { title: "No studio or date" });

    const started = await request("POST", "/api/tpdb/fetch-all");
    expect(started.statusCode).toBe(202);
    expect(started.json()).toMatchObject({ running: true, total: 2 });
    await fetchAllSettled();

    expect((await request("GET", "/api/tpdb")).json().fetchAll).toMatchObject({
      running: false,
      checked: 2,
      matched: 1,
      markers: 2,
    });
    const [row] = await db.select().from(mediaItems).where(eq(mediaItems.id, unmatched));
    expect(row.tpdbCheckedAt).not.toBeNull();
    expect(row.tpdbSceneId).toBeNull();
    expect((await request("GET", `/api/media-items/${matched}/markers`)).json().markers).toHaveLength(2);

    calls.length = 0;
    await request("POST", "/api/tpdb/fetch-all");
    await fetchAllSettled();
    expect(calls).toEqual([]);
  });

  it("stops at a rejected key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await videoAt("A", "2020-01-01");
    await videoAt("B", "2020-01-02");
    await request("POST", "/api/tpdb/fetch-all");
    await fetchAllSettled();
    const status = (await request("GET", "/api/tpdb")).json().fetchAll;
    expect(status).toMatchObject({ checked: 0, error: "ThePornDB rejected the API key." });
  });
});
