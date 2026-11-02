import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { mediaItems, oEvents, performers } from "../db/schema.js";
import { resetDatabase, signIn, signInOtherProfile, testApp } from "../test/harness.js";
import {
  linkPerformer,
  makeItem,
  makeLibrary,
  makePerformer,
  makeStudio,
} from "../test/fixtures.js";

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

const call = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown, as = cookie) =>
  app.inject({ method, url, payload: payload as object, headers: { cookie: as } });
const titles = (body: { items: { title: string }[] }) => body.items.map((i) => i.title).sort();

describe("organised flag", () => {
  it("is set and cleared by the owner, and filters the browse list", async () => {
    const done = await makeItem(libraryId, { title: "Done" });
    await makeItem(libraryId, { title: "Todo" });

    const set = await call("PUT", `/api/media-items/${done}/organised`, { organised: true });
    expect(set.statusCode).toBe(200);
    expect(set.json().organised).toBe(true);

    expect(titles((await call("GET", "/api/media-items?organised=false")).json())).toEqual(["Todo"]);
    expect(titles((await call("GET", "/api/media-items?organised=true")).json())).toEqual(["Done"]);
    expect(titles((await call("GET", "/api/media-items")).json())).toEqual(["Done", "Todo"]);

    const detail = (await call("GET", `/api/media-items/${done}`)).json();
    expect(detail.organisedAt).toBeTruthy();

    await call("PUT", `/api/media-items/${done}/organised`, { organised: false });
    expect(titles((await call("GET", "/api/media-items?organised=false")).json())).toEqual(["Done", "Todo"]);
  });

  it("refuses non-owners, bad bodies and unknown items", async () => {
    const id = await makeItem(libraryId);
    const guest = await signInOtherProfile();
    expect((await call("PUT", `/api/media-items/${id}/organised`, { organised: true }, guest.cookie)).statusCode).toBe(403);
    expect((await call("PUT", `/api/media-items/${id}/organised`, { organised: "yes" })).statusCode).toBe(400);
    expect((await call("PUT", "/api/media-items/999999/organised", { organised: true })).statusCode).toBe(404);
  });

  it("does not reveal or change a vault item", async () => {
    const hidden = await makeItem(libraryId, { hiddenAt: new Date() });
    expect((await call("PUT", `/api/media-items/${hidden}/organised`, { organised: true })).statusCode).toBe(404);
    const [row] = await db.select().from(mediaItems).where(eq(mediaItems.id, hidden));
    expect(row.organisedAt).toBeNull();
  });
});

describe("O-counter", () => {
  it("counts, undoes, and never goes below zero", async () => {
    const id = await makeItem(libraryId);
    expect((await call("POST", `/api/media-items/${id}/o`)).json()).toEqual({ oCount: 1 });
    expect((await call("POST", `/api/media-items/${id}/o`)).json()).toEqual({ oCount: 2 });
    expect((await call("GET", `/api/media-items/${id}`)).json().oCount).toBe(2);

    expect((await call("DELETE", `/api/media-items/${id}/o`)).json()).toEqual({ oCount: 1 });
    expect((await call("DELETE", `/api/media-items/${id}/o`)).json()).toEqual({ oCount: 0 });
    expect((await call("DELETE", `/api/media-items/${id}/o`)).json()).toEqual({ oCount: 0 });
    expect(await db.select().from(oEvents)).toHaveLength(0);
  });

  it("keeps the tally and the history in step under parallel counts", async () => {
    const id = await makeItem(libraryId);
    await Promise.all(Array.from({ length: 8 }, () => call("POST", `/api/media-items/${id}/o`)));
    expect((await call("GET", `/api/media-items/${id}`)).json().oCount).toBe(8);
    expect(await db.select().from(oEvents)).toHaveLength(8);
  });

  it("is per profile", async () => {
    const id = await makeItem(libraryId);
    const guest = await signInOtherProfile();
    await call("POST", `/api/media-items/${id}/o`);
    await call("POST", `/api/media-items/${id}/o`, undefined, guest.cookie);
    await call("POST", `/api/media-items/${id}/o`, undefined, guest.cookie);

    expect((await call("GET", `/api/media-items/${id}`)).json().oCount).toBe(1);
    expect((await call("GET", `/api/media-items/${id}`, undefined, guest.cookie)).json().oCount).toBe(2);
  });

  it("answers 404 for unknown and vault items, and appears in insights only when visible", async () => {
    expect((await call("POST", "/api/media-items/999999/o")).statusCode).toBe(404);
    expect((await call("POST", "/api/media-items/abc/o")).statusCode).toBe(404);

    const shown = await makeItem(libraryId, { title: "Shown" });
    await call("POST", `/api/media-items/${shown}/o`);
    const insights = (await call("GET", "/api/insights")).json();
    expect(insights.oLog).toHaveLength(1);
    expect(insights.items.find((i: { id: number }) => i.id === shown).oCount).toBe(1);

    // Hidden afterwards: its history leaves the page with it.
    await call("PUT", `/api/media-items/${shown}/hidden`, { hidden: true });
    const after = (await call("GET", "/api/insights")).json();
    expect(after.oLog).toHaveLength(0);
    expect((await call("POST", `/api/media-items/${shown}/o`)).statusCode).toBe(404);
  });
});

describe("smart collection rules from this phase", () => {
  async function smart(conditions: unknown[], op: "AND" | "OR" = "AND") {
    const created = await call("POST", "/api/collections", {
      name: "Smart",
      type: "smart",
      smartRule: { op, conditions },
    });
    expect(created.statusCode).toBe(201);
    const items = await call("GET", `/api/collections/${created.json().id}/items`);
    if (items.statusCode !== 200) throw new Error(items.body);
    return titles(items.json());
  }

  it("matches resolution, codec and bitrate from the probe metadata", async () => {
    await makeItem(libraryId, {
      title: "UHD",
      extraMetadata: { height: 2160, codec: "hevc", bitrateKbps: 20000 },
    });
    await makeItem(libraryId, {
      title: "HD",
      extraMetadata: { height: 720, codec: "h264", bitrateKbps: 3000 },
    });
    await makeItem(libraryId, { title: "Unprobed" });

    expect(await smart([{ field: "resolution", op: "eq", value: "4k" }])).toEqual(["UHD"]);
    expect(await smart([{ field: "codec", op: "eq", value: "H264" }])).toEqual(["HD"]);
    expect(await smart([{ field: "bitrateKbps", op: "gte", value: 10000 }])).toEqual(["UHD"]);
    // Unknown fails both ends of a bitrate range.
    expect(await smart([{ field: "bitrateKbps", op: "lte", value: 50000 }])).toEqual(["HD", "UHD"]);
  });

  it("matches organised and the viewer's own O-count", async () => {
    const a = await makeItem(libraryId, { title: "A" });
    await makeItem(libraryId, { title: "B" });
    await call("PUT", `/api/media-items/${a}/organised`, { organised: true });
    await call("POST", `/api/media-items/${a}/o`);
    await call("POST", `/api/media-items/${a}/o`);

    expect(await smart([{ field: "organised", op: "eq", value: true }])).toEqual(["A"]);
    expect(await smart([{ field: "organised", op: "eq", value: false }])).toEqual(["B"]);
    expect(await smart([{ field: "oCount", op: "gte", value: 2 }])).toEqual(["A"]);
    expect(await smart([{ field: "oCount", op: "gte", value: 3 }])).toEqual([]);
  });

  it("matches performer age at release, height and attributes", async () => {
    const young = await makePerformer("Young");
    const older = await makePerformer("Older");
    await db.update(performers).set({ birthdate: "2000-06-01", heightCm: 160, country: "Spain" }).where(eq(performers.id, young));
    await db.update(performers).set({ birthdate: "1980-06-01", heightCm: 180, country: "France" }).where(eq(performers.id, older));

    const a = await makeItem(libraryId, { title: "Young scene", releaseDate: "2024-07-01" });
    const b = await makeItem(libraryId, { title: "Older scene", releaseDate: "2024-07-01" });
    const c = await makeItem(libraryId, { title: "Undated" });
    await linkPerformer(a, young);
    await linkPerformer(b, older);
    await linkPerformer(c, young);

    expect(await smart([{ field: "performerAge", op: "lte", value: 30 }])).toEqual(["Young scene"]);
    expect(await smart([{ field: "performerAge", op: "gte", value: 40 }])).toEqual(["Older scene"]);
    expect(await smart([{ field: "performerHeight", op: "gte", value: 170 }])).toEqual(["Older scene"]);
    expect(
      await smart([{ field: "performerAttribute", attribute: "country", op: "eq", value: "spain" }]),
    ).toEqual(["Undated", "Young scene"]);
  });

  it("matches a studio and every site under it", async () => {
    const network = await makeStudio("Network");
    const site = await makeStudio("Site");
    await call("PATCH", `/api/studios/${site}`, { parentId: network });
    await makeItem(libraryId, { title: "On the site", studioId: site });
    await makeItem(libraryId, { title: "Elsewhere", studioId: await makeStudio("Other") });

    expect(await smart([{ field: "studio", op: "eq", value: "network" }])).toEqual(["On the site"]);
  });

  it("rejects malformed rules instead of widening the collection", async () => {
    const bad = [
      { field: "resolution", op: "eq", value: "8k" },
      { field: "performerAttribute", attribute: "password_hash", op: "eq", value: "x" },
      { field: "performerAge", op: "gte", value: 0 },
      { field: "bitrateKbps", op: "gte", value: -5 },
      { field: "organised", op: "eq", value: "yes" },
      { field: "studio", op: "eq", value: "" },
    ];
    for (const condition of bad) {
      const res = await call("POST", "/api/collections", {
        name: "Bad",
        type: "smart",
        smartRule: { op: "AND", conditions: [condition] },
      });
      expect(res.statusCode, JSON.stringify(condition)).toBe(400);
    }
  });
});
