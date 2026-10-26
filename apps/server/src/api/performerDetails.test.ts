import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { mediaItemPerformers, performerAliases, performers } from "../db/schema.js";
import { resetDatabase, signIn, signInOtherProfile, testApp } from "../test/harness.js";
import { linkPerformer, makeItem, makeLibrary, makePerformer } from "../test/fixtures.js";
import { ageOn, parseAliases, parsePerformerDetails } from "./performerDetails.js";

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

const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });
const send = (method: "PUT" | "PATCH", url: string, payload: unknown, as = cookie) =>
  app.inject({ method, url, payload: payload as object, headers: { cookie: as } });

describe("parsePerformerDetails", () => {
  const today = "2026-10-26";

  it("keeps only the fields that were sent", () => {
    expect(parsePerformerDetails({ country: "Spain" }, today)).toEqual({
      ok: true,
      value: { country: "Spain" },
    });
  });

  it("stores empty text as null, like the bio", () => {
    expect(parsePerformerDetails({ tattoos: "   " }, today)).toEqual({
      ok: true,
      value: { tattoos: null },
    });
  });

  it.each([
    [{ gender: "robot" }],
    [{ birthdate: "2001-02-30" }],
    [{ birthdate: "02/03/2001" }],
    [{ birthdate: "2027-01-01" }],
    [{ heightCm: 900 }],
    [{ heightCm: 170.5 }],
    [{ careerStart: 1850 }],
  ])("rejects %j rather than storing a nearby value", (body) => {
    expect(parsePerformerDetails(body as never, today).ok).toBe(false);
  });
});

describe("parseAliases", () => {
  it("normalises, drops case-only repeats and the performer's own name", () => {
    expect(parseAliases(["  Jane   D. ", "jane d.", "Jane Doe", ""], "Jane Doe")).toEqual({
      ok: true,
      value: ["Jane D."],
    });
  });

  it("refuses anything but a list of names", () => {
    expect(parseAliases("Jane D.", "Jane Doe").ok).toBe(false);
    expect(parseAliases([42], "Jane Doe").ok).toBe(false);
  });
});

describe("ageOn", () => {
  it("counts whole years, turning over on the birthday", () => {
    expect(ageOn("2000-06-15", "2020-06-14")).toBe(19);
    expect(ageOn("2000-06-15", "2020-06-15")).toBe(20);
  });

  it("gives nothing when a date is missing or comes before the birth", () => {
    expect(ageOn(null, "2020-01-01")).toBeNull();
    expect(ageOn("2000-01-01", null)).toBeNull();
    expect(ageOn("2000-01-01", "1999-01-01")).toBeNull();
  });
});

describe("PATCH /api/performers/:id — profile facts", () => {
  it("saves the facts and returns them on the profile", async () => {
    const jane = await makePerformer("Jane Doe");
    const res = await send("PATCH", `/api/performers/${jane}`, {
      gender: "female",
      birthdate: "1995-04-02",
      country: "Spain",
      heightCm: 168,
      careerStart: 2015,
      careerEnd: 2022,
    });
    expect(res.statusCode).toBe(200);

    expect((await get(`/api/performers/${jane}`)).json()).toMatchObject({
      gender: "female",
      birthdate: "1995-04-02",
      country: "Spain",
      heightCm: 168,
      careerStart: 2015,
      careerEnd: 2022,
      hairColor: null,
      aliases: [],
    });
  });

  it("leaves fields it was not sent alone", async () => {
    const jane = await makePerformer("Jane Doe");
    await send("PATCH", `/api/performers/${jane}`, { country: "Spain", bio: "Prose." });
    await send("PATCH", `/api/performers/${jane}`, { eyeColor: "Green" });

    expect((await get(`/api/performers/${jane}`)).json()).toMatchObject({
      country: "Spain",
      eyeColor: "Green",
      bio: "Prose.",
    });
  });

  it("clears a fact with null", async () => {
    const jane = await makePerformer("Jane Doe");
    await send("PATCH", `/api/performers/${jane}`, { birthdate: "1995-04-02" });
    await send("PATCH", `/api/performers/${jane}`, { birthdate: null });
    expect((await get(`/api/performers/${jane}`)).json().birthdate).toBeNull();
  });

  it("refuses a bad value with a 400 and saves nothing", async () => {
    const jane = await makePerformer("Jane Doe");
    const res = await send("PATCH", `/api/performers/${jane}`, { country: "Spain", gender: "robot" });
    expect(res.statusCode).toBe(400);
    expect((await get(`/api/performers/${jane}`)).json().country).toBeNull();
  });

  // Only the end is sent, so the check has to read the start already stored.
  it("refuses a career that ends before it starts, even sent one end at a time", async () => {
    const jane = await makePerformer("Jane Doe");
    await send("PATCH", `/api/performers/${jane}`, { careerStart: 2018 });
    expect((await send("PATCH", `/api/performers/${jane}`, { careerEnd: 2016 })).statusCode).toBe(400);
  });

  it("applies a rename and other fields sent together", async () => {
    const jane = await makePerformer("Jane Doe");
    await send("PATCH", `/api/performers/${jane}`, { name: "Jane Roe", country: "Spain" });
    expect((await get(`/api/performers/${jane}`)).json()).toMatchObject({
      name: "Jane Roe",
      country: "Spain",
    });
  });

  it("is the owner's to edit", async () => {
    const jane = await makePerformer("Jane Doe");
    const guest = await signInOtherProfile();
    expect((await send("PATCH", `/api/performers/${jane}`, { country: "Spain" }, guest.cookie)).statusCode).toBe(403);
    expect((await send("PATCH", `/api/performers/${jane}`, { aliases: ["JD"] }, guest.cookie)).statusCode).toBe(403);
  });

  it("answers 404 for a performer that does not exist", async () => {
    expect((await send("PATCH", "/api/performers/9999", { country: "Spain" })).statusCode).toBe(404);
  });

  it("answers 400 for a body with nothing in it", async () => {
    const jane = await makePerformer("Jane Doe");
    expect((await send("PATCH", `/api/performers/${jane}`, {})).statusCode).toBe(400);
  });
});

describe("PATCH /api/performers/:id — aliases", () => {
  it("replaces the alias list and returns it alphabetically", async () => {
    const jane = await makePerformer("Jane Doe");
    await send("PATCH", `/api/performers/${jane}`, { aliases: ["JD", "Janey"] });
    const res = await send("PATCH", `/api/performers/${jane}`, { aliases: ["Jane D.", "janey"] });
    expect(res.json().performer.aliases).toEqual(["Jane D.", "janey"]);
    expect((await get(`/api/performers/${jane}`)).json().aliases).toEqual(["Jane D.", "janey"]);
  });

  it("refuses an alias that is another performer's name", async () => {
    const jane = await makePerformer("Jane Doe");
    await makePerformer("Janey");
    const res = await send("PATCH", `/api/performers/${jane}`, { aliases: ["janey"] });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain("Janey");
  });

  it("refuses an alias another performer already has", async () => {
    const jane = await makePerformer("Jane Doe");
    const roe = await makePerformer("Jane Roe");
    await send("PATCH", `/api/performers/${roe}`, { aliases: ["JR"] });
    expect((await send("PATCH", `/api/performers/${jane}`, { aliases: ["jr"] })).statusCode).toBe(409);
  });

  it("refuses a rename to someone else's alias", async () => {
    const jane = await makePerformer("Jane Doe");
    const roe = await makePerformer("Jane Roe");
    await send("PATCH", `/api/performers/${roe}`, { aliases: ["JR"] });
    const res = await send("PATCH", `/api/performers/${jane}`, { name: "jr" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain("alias of Jane Roe");
  });

  it("allows a rename to one of their own aliases, which then stops being one", async () => {
    const jane = await makePerformer("Jane Doe");
    await send("PATCH", `/api/performers/${jane}`, { aliases: ["Jane D.", "JD"] });
    expect((await send("PATCH", `/api/performers/${jane}`, { name: "Jane D." })).statusCode).toBe(200);
    expect((await get(`/api/performers/${jane}`)).json()).toMatchObject({
      name: "Jane D.",
      aliases: ["JD"],
    });
  });

  it("goes with the performer when they are deleted", async () => {
    const jane = await makePerformer("Jane Doe");
    await send("PATCH", `/api/performers/${jane}`, { aliases: ["JD"] });
    await db.delete(performers).where(eq(performers.id, jane));
    expect(await db.select().from(performerAliases)).toEqual([]);
  });
});

describe("aliases elsewhere", () => {
  it("credits the performer when an alias is typed on a video", async () => {
    const jane = await makePerformer("Jane Doe");
    await send("PATCH", `/api/performers/${jane}`, { aliases: ["Jane D."] });
    const item = await makeItem(libraryId);

    const res = await send("PUT", `/api/media-items/${item}/performers`, { performerNames: ["jane d."] });
    expect(res.json().performers).toEqual([{ id: jane, name: "Jane Doe" }]);
    expect(await db.select().from(performers)).toHaveLength(1);
    expect(await db.select().from(mediaItemPerformers)).toEqual([
      expect.objectContaining({ mediaItemId: item, performerId: jane }),
    ]);
  });

  it("finds a performer in search by an alias", async () => {
    const jane = await makePerformer("Jane Doe");
    await send("PATCH", `/api/performers/${jane}`, { aliases: ["Sunny"] });
    const body = (await get("/api/search/suggestions?q=sunn")).json();
    expect(body.performers.map((p: { id: number }) => p.id)).toEqual([jane]);
  });
});

describe("age at release", () => {
  it("is on each performer credited on a video", async () => {
    const jane = await makePerformer("Jane Doe");
    const undated = await makePerformer("No Birthday");
    await send("PATCH", `/api/performers/${jane}`, { birthdate: "1995-04-02" });
    const item = await makeItem(libraryId, { releaseDate: "2020-04-01" });
    await linkPerformer(item, jane);
    await linkPerformer(item, undated);

    const detail = (await get(`/api/media-items/${item}`)).json();
    expect(detail.performers).toEqual(
      expect.arrayContaining([
        { id: jane, name: "Jane Doe", ageAtRelease: 24 },
        { id: undated, name: "No Birthday", ageAtRelease: null },
      ]),
    );
  });
});
