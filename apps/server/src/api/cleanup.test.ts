import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { albums, mediaItems, performers, playbackHeatmap, studios } from "../db/schema.js";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import {
  attachFile,
  linkPerformer,
  makeItem,
  makeLibrary,
  makePerformer,
  makeStudio,
  ownerProfileId,
} from "../test/fixtures.js";

let app: FastifyInstance;
let cookie: string;
let libraryId: number;
let rootId: number;

beforeAll(async () => {
  app = await testApp();
});
beforeEach(async () => {
  await resetDatabase();
  cookie = await signIn();
  ({ libraryId, rootId } = await makeLibrary());
});

const get = (url: string) =>
  app.inject({ method: "GET", url, headers: { cookie } });
const post = (url: string) =>
  app.inject({ method: "POST", url, headers: { cookie } });

/** An item left behind by a folder that is no longer watched. */
async function hiddenItem(title: string, extra = {}) {
  const id = await makeItem(libraryId, { title, inScope: false, ...extra });
  return id;
}

describe("cleaning up after a removed folder", () => {
  it("reports nothing to remove on a tidy library", async () => {
    await makeItem(libraryId, { title: "Kept" });
    expect((await get("/api/library/cleanup")).json().removable).toMatchObject({
      items: 0,
      performers: 0,
      studios: 0,
    });
  });

  it("counts hidden items without touching them", async () => {
    await hiddenItem("Gone one");
    await hiddenItem("Gone two");
    await makeItem(libraryId, { title: "Kept" });

    expect((await get("/api/library/cleanup")).json().removable.items).toBe(2);
    // Counting is not deleting.
    expect(await db.select().from(mediaItems)).toHaveLength(3);
  });

  it("removes the hidden items and leaves the watched ones", async () => {
    const gone = await hiddenItem("Gone");
    await attachFile(gone, rootId, "/media/gone.mp4");
    const kept = await makeItem(libraryId, { title: "Kept" });

    expect((await post("/api/library/cleanup")).json().removed.items).toBe(1);
    const left = await db.select().from(mediaItems);
    expect(left.map((row) => row.id)).toEqual([kept]);
  });

  // playback_heatmap was added after the delete path was written, and its
  // foreign key made the final delete fail, so cleanup 500'd with nothing
  // removed for anyone who had ever played a video.
  it("removes hidden items that have playback heatmap rows", async () => {
    const gone = await hiddenItem("Watched then hidden");
    await db.insert(playbackHeatmap).values({ profileId: await ownerProfileId(), mediaItemId: gone, bucket: 3 });

    const res = await post("/api/library/cleanup");
    expect(res.statusCode).toBe(200);
    expect(await db.select().from(mediaItems)).toHaveLength(0);
    expect(await db.select().from(playbackHeatmap)).toHaveLength(0);
  });

  // The whole point: names from a library you no longer have.
  it("takes performers and studios that only the hidden items used", async () => {
    const orphan = await makePerformer("Only Hidden");
    const shared = await makePerformer("Also Visible");
    const deadStudio = await makeStudio("Gone Studio");
    const liveStudio = await makeStudio("Kept Studio");

    const hidden = await hiddenItem("Gone", { studioId: deadStudio });
    await linkPerformer(hidden, orphan);
    await linkPerformer(hidden, shared);

    const kept = await makeItem(libraryId, { title: "Kept", studioId: liveStudio });
    await linkPerformer(kept, shared);

    const { removed } = (await post("/api/library/cleanup")).json();
    expect(removed).toMatchObject({ performers: 1, studios: 1 });

    const names = (await db.select().from(performers)).map((p) => p.name);
    expect(names).toEqual(["Also Visible"]);
    const studioNames = (await db.select().from(studios)).map((s) => s.name);
    expect(studioNames).toEqual(["Kept Studio"]);
  });

  it("spares a performer you wrote a bio for, even with nothing left", async () => {
    const authored = await makePerformer("Written Up");
    await db
      .update(performers)
      .set({ bio: "Notes I typed myself" })
      .where(eq(performers.id, authored));
    const hidden = await hiddenItem("Gone");
    await linkPerformer(hidden, authored);

    await post("/api/library/cleanup");
    expect(await db.select().from(performers)).toHaveLength(1);
  });

  // The failure this reproduces: albums.performer_id and albums.studio_id
  // reference rows the purge deletes, and nothing was clearing them, so
  // Postgres refused the delete and the whole cleanup 500'd with nothing
  // removed. It only happens when an album survives its performer.
  it("clears an album's performer and studio before deleting them", async () => {
    const performer = await makePerformer("Gone Performer");
    const studio = await makeStudio("Gone Studio");
    const hidden = await hiddenItem("Gone", { studioId: studio });
    await linkPerformer(hidden, performer);

    // An album that outlives them: it keeps an item, so it is not itself
    // debris, but it names both of the rows about to go.
    const kept = await makeItem(libraryId, { title: "Kept photo" });
    const [album] = await db
      .insert(albums)
      .values({
        path: "/media/an-album",
        title: "An album",
        performerId: performer,
        studioId: studio,
      })
      .returning();
    await db
      .update(mediaItems)
      .set({ albumId: album.id })
      .where(eq(mediaItems.id, kept));

    const res = await post("/api/library/cleanup");
    expect(res.statusCode).toBe(200);
    expect(res.json().removed).toMatchObject({ performers: 1, studios: 1 });

    // The album survives, no longer claiming either.
    const [after] = await db.select().from(albums).where(eq(albums.id, album.id));
    expect(after).toBeDefined();
    expect(after.performerId).toBeNull();
    expect(after.studioId).toBeNull();
  });

  // The state a half-finished cleanup leaves: items already gone, their
  // performers and studios still sitting there attached to nothing. The count
  // has to find these, or the panel hides with work outstanding.
  it("still reports entities orphaned by an earlier run", async () => {
    const stranded = await makePerformer("Stranded");
    const strandedStudio = await makeStudio("Stranded Studio");

    // No items at all — as if the cleanup deleted them and stopped.
    const { removable } = (await get("/api/library/cleanup")).json();
    expect(removable.items).toBe(0);
    expect(removable.performers).toBe(1);
    expect(removable.studios).toBe(1);

    const { removed } = (await post("/api/library/cleanup")).json();
    expect(removed).toMatchObject({ performers: 1, studios: 1 });
    expect(await db.select().from(performers)).toHaveLength(0);
    expect(await db.select().from(studios)).toHaveLength(0);
    expect(stranded).toBeDefined();
    expect(strandedStudio).toBeDefined();
  });

  it("is safe to run twice", async () => {
    await hiddenItem("Gone");
    expect((await post("/api/library/cleanup")).json().removed.items).toBe(1);
    expect((await post("/api/library/cleanup")).json().removed.items).toBe(0);
  });
});
