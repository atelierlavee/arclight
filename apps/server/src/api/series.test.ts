// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { series } from "../db/schema.js";
import { resetDatabase, signIn, signInOtherProfile, testApp } from "../test/harness.js";
import { linkPerformer, makeItem, makeLibrary, makePerformer, makeStudio } from "../test/fixtures.js";

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
});
afterAll(async () => {
  await app.close();
});

async function makeSeries(name: string): Promise<number> {
  const [row] = await db.insert(series).values({ libraryId, name, nameSource: "user" }).returning();
  return row.id;
}

const get = async (url: string) => app.inject({ method: "GET", url, headers: { cookie } });

describe("GET /api/series/:id", () => {
  it("adds the cast, studio, release years and the first part's description", async () => {
    const seriesId = await makeSeries("Lana");
    const studioId = await makeStudio("Tushy");
    const lana = await makePerformer("Lana Rhoades");
    const other = await makePerformer("Someone Else");
    const first = await makeItem(libraryId, {
      title: "Part 1",
      seriesId,
      seasonNumber: 1,
      episodeNumber: 1,
      studioId,
      releaseDate: "2017-03-01",
      description: "Where it starts.",
    });
    const second = await makeItem(libraryId, {
      title: "Part 2",
      seriesId,
      seasonNumber: 1,
      episodeNumber: 2,
      studioId,
      releaseDate: "2018-01-15",
      description: "Where it goes.",
    });
    await linkPerformer(first, lana);
    await linkPerformer(second, lana);
    await linkPerformer(second, other);

    const body = (await get(`/api/series/${seriesId}`)).json();

    expect(body.description).toBe("Where it starts.");
    expect(body.studios).toEqual(["Tushy"]);
    expect(body.firstReleased).toBe("2017-03-01");
    expect(body.lastReleased).toBe("2018-01-15");
    expect(body.performers).toEqual([
      { id: lana, name: "Lana Rhoades", parts: 2 },
      { id: other, name: "Someone Else", parts: 1 },
    ]);
    // Each part carries its own description for its row.
    expect(body.seasons[0].episodes[1].description).toBe("Where it goes.");
    expect(body.seasons[0].episodes[0]).toHaveProperty("lastPlayedAt", null);
    // Who is in each part, which can differ from one to the next.
    expect(body.seasons[0].episodes[0].performers).toEqual([{ id: lana, name: "Lana Rhoades" }]);
    expect(body.seasons[0].episodes[1].performers).toEqual([
      { id: lana, name: "Lana Rhoades" },
      { id: other, name: "Someone Else" },
    ]);
  });
});

describe("GET /api/series", () => {
  it("gives each series its first three episodes, in order, for the cover", async () => {
    const seriesId = await makeSeries("Saga");
    const ep = async (n: number) => makeItem(libraryId, { title: `Ep ${n}`, seriesId, seasonNumber: 1, episodeNumber: n });
    const fourth = await ep(4);
    const second = await ep(2);
    const first = await ep(1);
    const third = await ep(3);
    void fourth;

    const body = (await get("/api/series")).json();

    expect(body.series[0].coverItemIds).toEqual([first, second, third]);
  });
});

describe("GET /api/series (the list's richer facts)", () => {
  it("gives the studio, years, lead performer and each episode's place, in order", async () => {
    const seriesId = await makeSeries("Lana");
    const studioId = await makeStudio("Tushy");
    const lana = await makePerformer("Lana Rhoades");
    const one = await makeItem(libraryId, { seriesId, seasonNumber: 1, episodeNumber: 1, studioId, releaseDate: "2016-12-22", durationSeconds: 100 });
    const two = await makeItem(libraryId, { seriesId, seasonNumber: 1, episodeNumber: 2, studioId, releaseDate: "2017-03-12", durationSeconds: 200 });
    await linkPerformer(one, lana);
    await linkPerformer(two, lana);

    const [entry] = (await get("/api/series")).json().series;

    expect(entry.studios).toEqual(["Tushy"]);
    expect(entry.firstReleased).toBe("2016-12-22");
    expect(entry.lastReleased).toBe("2017-03-12");
    expect(entry.lead).toEqual({ id: lana, name: "Lana Rhoades" });
    expect(entry.episodes.map((episode: { id: number }) => episode.id)).toEqual([one, two]);
    expect(entry.episodes[0]).toMatchObject({ position: 0, duration: 100, completed: false });
    expect(entry.lastPlayedAt).toBeNull();
  });
});

describe("GET /api/series?performer=", () => {
  it("lists only series with that performer in an episode", async () => {
    const lana = await makePerformer("Lana Rhoades");
    const other = await makePerformer("Someone Else");
    const hers = await makeSeries("Lana");
    await linkPerformer(await makeItem(libraryId, { seriesId: hers }), lana);
    const theirs = await makeSeries("Other");
    await linkPerformer(await makeItem(libraryId, { seriesId: theirs }), other);

    const body = (await get(`/api/series?performer=${lana}`)).json();

    expect(body.series.map((entry: { name: string }) => entry.name)).toEqual(["Lana"]);
  });
});

describe("GET /api/series/suggestions", () => {
  it("offers one studio's numbered parts not yet in a series", async () => {
    const studioId = await makeStudio("Tushy");
    const first = await makeItem(libraryId, { title: "Lana part 1", studioId });
    const fourth = await makeItem(libraryId, { title: "LANA Part 4", studioId });
    const inSeries = await makeSeries("Taken");
    await makeItem(libraryId, { title: "LANA Part 5", studioId, seriesId: inSeries });

    const { suggestions } = (await get("/api/series/suggestions")).json();

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ name: "Lana", studio: "Tushy" });
    expect(suggestions[0].items.map((item: { id: number }) => item.id)).toEqual([first, fourth]);
  });
});

describe("GET /api/series/:id/related", () => {
  it("lists series sharing performers first, then the same studio, and leaves out unrelated ones", async () => {
    const studio = await makeStudio("Tushy");
    const otherStudio = await makeStudio("Elsewhere");
    const lana = await makePerformer("Lana Rhoades");
    const stranger = await makePerformer("Stranger");

    const main = await makeSeries("Lana");
    await linkPerformer(await makeItem(libraryId, { seriesId: main, studioId: studio }), lana);

    const sharesPerformer = await makeSeries("Another Lana saga");
    await linkPerformer(await makeItem(libraryId, { seriesId: sharesPerformer, studioId: otherStudio }), lana);

    const sameStudio = await makeSeries("Tushy saga");
    await linkPerformer(await makeItem(libraryId, { seriesId: sameStudio, studioId: studio }), stranger);

    const unrelated = await makeSeries("Unrelated");
    await linkPerformer(await makeItem(libraryId, { seriesId: unrelated, studioId: otherStudio }), stranger);

    const body = (await get(`/api/series/${main}/related`)).json();

    expect(body.series.map((entry: { name: string }) => entry.name)).toEqual(["Another Lana saga", "Tushy saga"]);
  });
});

describe("series covers", () => {
  /** A real little JPEG in a multipart body, as a browser would send it. */
  async function imageUpload(): Promise<{ payload: Buffer; headers: Record<string, string> }> {
    const { default: sharp } = await import("sharp");
    const image = await sharp({ create: { width: 64, height: 36, channels: 3, background: "#c33" } }).jpeg().toBuffer();
    const boundary = "----arclight-test-boundary";
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="cover.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      image,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return { payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
  }

  it("sets, serves, replaces and removes a cover, and shows it on the series", async () => {
    const seriesId = await makeSeries("Lana");
    await makeItem(libraryId, { seriesId });

    const upload = await imageUpload();
    const set = await app.inject({
      method: "POST",
      url: `/api/series/${seriesId}/cover`,
      headers: { cookie, ...upload.headers },
      payload: upload.payload,
    });
    expect(set.statusCode).toBe(200);
    const first = set.json().coverFile as string;

    expect((await get(`/api/series/${seriesId}`)).json().coverFile).toBe(first);
    expect((await get("/api/series")).json().series[0].coverFile).toBe(first);
    const served = await get(`/api/series/${seriesId}/cover`);
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toContain("image/jpeg");

    // Replacing gives a new file name, so a browser can't show the old one.
    const again = await imageUpload();
    const replaced = await app.inject({
      method: "POST",
      url: `/api/series/${seriesId}/cover`,
      headers: { cookie, ...again.headers },
      payload: again.payload,
    });
    expect(replaced.json().coverFile).not.toBe(first);

    const removed = await app.inject({ method: "DELETE", url: `/api/series/${seriesId}/cover`, headers: { cookie } });
    expect(removed.statusCode).toBe(200);
    expect((await get(`/api/series/${seriesId}`)).json().coverFile).toBeNull();
    expect((await get(`/api/series/${seriesId}/cover`)).statusCode).toBe(404);
  });

  it("refuses something that isn't an image", async () => {
    const seriesId = await makeSeries("Lana");
    const boundary = "----arclight-test-boundary";
    const payload = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="cover.jpg"\r\nContent-Type: image/jpeg\r\n\r\nnot an image\r\n--${boundary}--\r\n`,
    );
    const response = await app.inject({
      method: "POST",
      url: `/api/series/${seriesId}/cover`,
      headers: { cookie, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    expect(response.statusCode).toBe(400);
  });

  it("keeps setting a cover to the owner", async () => {
    const seriesId = await makeSeries("Lana");
    const other = await signInOtherProfile();
    const upload = await imageUpload();
    const response = await app.inject({
      method: "POST",
      url: `/api/series/${seriesId}/cover`,
      headers: { cookie: other.cookie, ...upload.headers },
      payload: upload.payload,
    });
    expect(response.statusCode).toBe(403);
  });
});
