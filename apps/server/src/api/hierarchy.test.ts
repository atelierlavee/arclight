import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { studios, tagParents, tags } from "../db/schema.js";
import { resetDatabase, signIn, signInOtherProfile, testApp } from "../test/harness.js";
import { linkTag, makeItem, makeLibrary, makeStudio, makeTag } from "../test/fixtures.js";
import { purgeEmptyEntities } from "../library/scope.js";

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
const send = (method: "POST" | "PUT" | "PATCH", url: string, payload: unknown, as = cookie) =>
  app.inject({ method, url, payload: payload as object, headers: { cookie: as } });
const titles = (body: { items: { title: string }[] }) => body.items.map((i) => i.title).sort();

/** Outdoor > Beach > Nude beach, with Beach also under Vacation. */
async function tagFamily() {
  const outdoor = await makeTag("Outdoor");
  const vacation = await makeTag("Vacation");
  const beach = await makeTag("Beach");
  const nude = await makeTag("Nude beach");
  await send("PATCH", `/api/tags/${beach}`, { parentIds: [outdoor, vacation] });
  await send("PATCH", `/api/tags/${nude}`, { parentIds: [beach] });
  return { outdoor, vacation, beach, nude };
}

describe("tag families", () => {
  it("lists each tag's parents, description and visible item count", async () => {
    const { outdoor, vacation, beach } = await tagFamily();
    await send("PATCH", `/api/tags/${beach}`, { description: "Sand." });
    await linkTag(await makeItem(libraryId), beach);
    await linkTag(await makeItem(libraryId, { hiddenAt: new Date() }), beach);

    const listed = (await get("/api/tags")).json().tags.find((t: { id: number }) => t.id === beach);
    expect(listed).toMatchObject({ description: "Sand.", itemCount: 1 });
    expect(listed.parentIds.sort()).toEqual([outdoor, vacation].sort());
  });

  it("filters by a tag to include everything under it, at any depth", async () => {
    const { outdoor, vacation, beach, nude } = await tagFamily();
    const pool = await makeTag("Pool");
    await linkTag(await makeItem(libraryId, { title: "At the beach" }), beach);
    await linkTag(await makeItem(libraryId, { title: "Nude beach day" }), nude);
    await linkTag(await makeItem(libraryId, { title: "Pool party" }), pool);
    await linkTag(await makeItem(libraryId, { title: "Hiking" }), outdoor);

    expect(titles((await get("/api/media-items?tag=Outdoor")).json())).toEqual([
      "At the beach",
      "Hiking",
      "Nude beach day",
    ]);
    // Through the second parent too, and through the multi-value filter.
    expect(titles((await get("/api/media-items?tags=vacation")).json())).toEqual([
      "At the beach",
      "Nude beach day",
    ]);
    // A child does not include its parent.
    expect(titles((await get("/api/media-items?tag=Beach")).json())).toEqual([
      "At the beach",
      "Nude beach day",
    ]);
    expect(vacation).toBeTruthy();
  });

  it("includes tags under the one a smart collection names", async () => {
    const { beach } = await tagFamily();
    await linkTag(await makeItem(libraryId, { title: "At the beach" }), beach);
    await makeItem(libraryId, { title: "Untagged" });
    const created = (
      await send("POST", "/api/collections", {
        name: "Outside",
        type: "smart",
        smartRule: { op: "AND", conditions: [{ field: "tags", op: "contains", value: "Outdoor" }] },
      })
    ).json();
    expect(titles((await get(`/api/collections/${created.id}/items`)).json())).toEqual(["At the beach"]);
  });

  it.each([
    ["itself", (t: Awaited<ReturnType<typeof tagFamily>>) => [t.beach], (t: Awaited<ReturnType<typeof tagFamily>>) => t.beach],
    ["a tag under it", (t: Awaited<ReturnType<typeof tagFamily>>) => [t.nude], (t: Awaited<ReturnType<typeof tagFamily>>) => t.outdoor],
    ["a missing tag", () => [99999], (t: Awaited<ReturnType<typeof tagFamily>>) => t.beach],
  ])("refuses %s as a parent", async (_, parents, target) => {
    const family = await tagFamily();
    const res = await send("PATCH", `/api/tags/${target(family)}`, { parentIds: parents(family) });
    expect(res.statusCode).toBe(400);
  });

  it("clears parents with an empty list", async () => {
    const { beach } = await tagFamily();
    await send("PATCH", `/api/tags/${beach}`, { parentIds: [] });
    const listed = (await get("/api/tags")).json().tags.find((t: { id: number }) => t.id === beach);
    expect(listed.parentIds).toEqual([]);
  });

  it("is the owner's to edit", async () => {
    const beach = await makeTag("Beach");
    const guest = await signInOtherProfile();
    expect((await send("PATCH", `/api/tags/${beach}`, { description: "x" }, guest.cookie)).statusCode).toBe(403);
  });

  it("answers 404 for a tag that does not exist", async () => {
    expect((await send("PATCH", "/api/tags/99999", { description: "x" })).statusCode).toBe(404);
  });
});

describe("studio networks", () => {
  async function network() {
    const group = (await send("POST", "/api/studios", { name: "Vixen Media Group" })).json().studio.id as number;
    const vixen = await makeStudio("Vixen");
    const tushy = await makeStudio("Tushy");
    await send("PATCH", `/api/studios/${vixen}`, { parentId: group });
    await send("PATCH", `/api/studios/${tushy}`, { parentId: group });
    await makeItem(libraryId, { title: "V1", studioId: vixen });
    await makeItem(libraryId, { title: "T1", studioId: tushy });
    await makeItem(libraryId, { title: "T2", studioId: tushy });
    return { group, vixen, tushy };
  }

  it("creates a network by hand, marked as the owner's", async () => {
    const res = await send("POST", "/api/studios", { name: "  Vixen   Media Group " });
    expect(res.statusCode).toBe(201);
    expect(res.json().studio).toMatchObject({ name: "Vixen Media Group", origin: "user" });
    expect((await send("POST", "/api/studios", { name: "vixen media group" })).statusCode).toBe(409);
  });

  it("counts a network's sites' videos on its card", async () => {
    const { group, tushy } = await network();
    const listed = (await get("/api/studios")).json().studios;
    expect(listed.find((s: { id: number }) => s.id === group)).toMatchObject({ videoCount: 3, parentId: null });
    expect(listed.find((s: { id: number }) => s.id === tushy)).toMatchObject({ videoCount: 2, parentId: group });
  });

  it("shows the whole network on its page, and the network on a site's", async () => {
    const { group, vixen, tushy } = await network();
    const page = (await get(`/api/studios/${group}`)).json();
    expect(page).toMatchObject({ videoCount: 3, parent: null });
    expect(page.sites.map((s: { id: number }) => s.id)).toEqual([tushy, vixen]);

    expect((await get(`/api/studios/${vixen}`)).json()).toMatchObject({
      videoCount: 1,
      parent: { id: group, name: "Vixen Media Group" },
      sites: [],
    });
  });

  it("filters by a network to include its sites", async () => {
    await network();
    expect(titles((await get("/api/media-items?studio=vixen media group")).json())).toEqual(["T1", "T2", "V1"]);
    expect(titles((await get("/api/media-items?studio=Tushy")).json())).toEqual(["T1", "T2"]);
  });

  it("refuses a network that would make a loop", async () => {
    const { group, vixen } = await network();
    expect((await send("PATCH", `/api/studios/${group}`, { parentId: vixen })).statusCode).toBe(400);
    expect((await send("PATCH", `/api/studios/${vixen}`, { parentId: vixen })).statusCode).toBe(400);
  });

  it("takes a site out of its network with null", async () => {
    const { vixen } = await network();
    await send("PATCH", `/api/studios/${vixen}`, { parentId: null });
    expect((await get(`/api/studios/${vixen}`)).json().parent).toBeNull();
  });

  it("is the owner's to edit", async () => {
    const vixen = await makeStudio("Vixen");
    const guest = await signInOtherProfile();
    expect((await send("PATCH", `/api/studios/${vixen}`, { parentId: null }, guest.cookie)).statusCode).toBe(403);
    expect((await send("POST", "/api/studios", { name: "Group" }, guest.cookie)).statusCode).toBe(403);
  });
});

describe("the end-of-scan purge", () => {
  it("keeps a hand-made network and a studio with sites", async () => {
    const group = (await send("POST", "/api/studios", { name: "Hand Made" })).json().studio.id as number;
    const parent = await makeStudio("Has Sites");
    const site = await makeStudio("Site");
    await db.update(studios).set({ parentId: parent }).where(eq(studios.id, site));
    await makeStudio("Debris");

    await purgeEmptyEntities();
    expect((await db.select().from(studios)).map((s) => s.name).sort()).toEqual([
      "Hand Made",
      "Has Sites",
    ]);
    expect(group).toBeTruthy();
  });

  it("drops a tag's family links when the tag goes", async () => {
    const { beach, nude } = await tagFamily();
    await db.delete(tags).where(eq(tags.id, nude));
    await db.delete(tags).where(eq(tags.id, beach));
    expect(await db.select().from(tagParents)).toEqual([]);
  });
});
