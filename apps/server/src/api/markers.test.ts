import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { resetDatabase, signIn, signInOtherProfile, testApp } from "../test/harness.js";
import { makeItem, makeLibrary, makeStudio } from "../test/fixtures.js";
import { deleteItems } from "../library/forget.js";
import { db } from "../db/client.js";
import { mediaItemMarkers, mediaItems } from "../db/schema.js";
import { fitMarkers } from "./markers.js";
import { searchTpdbScenes } from "../metadata/tpdb.js";

let app: FastifyInstance;
let cookie: string;
let libraryId: number;

beforeAll(async () => {
  app = await testApp();
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

const getMarkers = async (id: number, as = cookie) =>
  app.inject({ method: "GET", url: `/api/media-items/${id}/markers`, headers: { cookie: as } });

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

async function videoAt(studio: string, date: string | null, title = "Main Event") {
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
  it("is sure only about one scene on the same date from the same studio or network", async () => {
    fakeTpdb([mainEvent, { ...mainEvent, id: "other", date: "2021-01-01" }]);
    const query = { studio: "BlackedRaw", date: "2020-02-13", title: "Main Event" };
    expect((await searchTpdbScenes("k", query)).confidentId).toBe("scene-1");
    expect((await searchTpdbScenes("k", { ...query, studio: "Vixen Media Group" })).confidentId).toBe("scene-1");
    expect((await searchTpdbScenes("k", { ...query, studio: "Tushy" })).confidentId).toBeNull();
  });

  it("is not sure when two scenes fit", async () => {
    fakeTpdb([mainEvent, { ...mainEvent, id: "twin" }]);
    const found = await searchTpdbScenes("k", { studio: "Blacked Raw", date: "2020-02-13", title: "x" });
    expect(found.confidentId).toBeNull();
  });
});

describe("GET /api/media-items/:id/markers", () => {
  it("looks a video up on its first open, stores the markers, and never asks again", async () => {
    const calls = fakeTpdb([mainEvent]);
    const id = await videoAt("Blacked Raw", "2020-02-13");

    const first = (await getMarkers(id)).json();
    expect(first.markers.map((m: { title: string }) => m.title)).toEqual(["Blowjob", "Missionary"]);
    expect(first.markers[0]).toMatchObject({ startSeconds: 519, endSeconds: 600 });
    const [row] = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
    expect(row.tpdbSceneId).toBe("scene-1");

    calls.length = 0;
    expect((await getMarkers(id)).json().markers).toHaveLength(2);
    expect(calls).toEqual([]);
  });

  it("asks once when the player opens it twice at the same moment", async () => {
    const calls = fakeTpdb([mainEvent]);
    const id = await videoAt("Blacked Raw", "2020-02-13");
    await Promise.all([getMarkers(id), getMarkers(id)]);
    expect(calls.filter((url) => url.includes("/scenes?"))).toHaveLength(1);
    expect(await db.select().from(mediaItemMarkers)).toHaveLength(2);
  });

  it("records a video with no sure match as checked, with no markers", async () => {
    const calls = fakeTpdb([mainEvent]);
    const id = await videoAt("Someone Else", "2020-02-13");
    expect((await getMarkers(id)).json().markers).toEqual([]);
    calls.length = 0;
    await getMarkers(id);
    expect(calls).toEqual([]);
  });

  it("does not ask about a video without a studio and date, nor mark it checked", async () => {
    const calls = fakeTpdb([mainEvent]);
    const id = await videoAt("Blacked Raw", null);
    expect((await getMarkers(id)).json().markers).toEqual([]);
    expect(calls).toEqual([]);
    const [row] = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
    expect(row.tpdbCheckedAt).toBeNull();
  });

  it("leaves a video unchecked when ThePornDB can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    const id = await videoAt("Blacked Raw", "2020-02-13");
    expect((await getMarkers(id)).statusCode).toBe(200);
    const [row] = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
    expect(row.tpdbCheckedAt).toBeNull();
  });

  it("asks nothing without a key", async () => {
    delete process.env.TPDB_API_KEY;
    const calls = fakeTpdb([mainEvent]);
    const id = await videoAt("Blacked Raw", "2020-02-13");
    expect((await getMarkers(id)).json().markers).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("shows every profile the same markers, and hides a vault item's", async () => {
    fakeTpdb([mainEvent]);
    const id = await videoAt("Blacked Raw", "2020-02-13");
    await getMarkers(id);
    const guest = await signInOtherProfile("Guest");
    expect((await getMarkers(id, guest.cookie)).json().markers).toHaveLength(2);

    const hidden = await makeItem(libraryId, { hiddenAt: new Date() });
    expect((await getMarkers(hidden)).statusCode).toBe(404);
  });

  it("goes when its video is deleted", async () => {
    fakeTpdb([mainEvent]);
    const id = await videoAt("Blacked Raw", "2020-02-13");
    await getMarkers(id);
    await deleteItems([id]);
    expect(await db.select().from(mediaItemMarkers)).toEqual([]);
  });
});
