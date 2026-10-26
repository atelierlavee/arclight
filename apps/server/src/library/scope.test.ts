import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/client.js";
import { libraryRoots, mediaFiles, mediaItems, performerAliases, performers, studios } from "../db/schema.js";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import {
  attachFile,
  linkPerformer,
  makeFolder,
  makeItem,
  makeLibrary,
  makePerformer,
  makeStudio,
  setPerformerFavoriteFor,
} from "../test/fixtures.js";
import { purgeEmptyEntities, recomputeScope } from "./scope.js";

let libraryId: number;
let rootId: number;

beforeEach(async () => {
  await testApp();
  await resetDatabase();
  ({ libraryId, rootId } = await makeLibrary());
});

describe("recomputeScope", () => {
  it("keeps an item whose file belongs to a configured folder", async () => {
    const id = await makeItem(libraryId, { title: "In scope", inScope: false });
    await attachFile(id, rootId, "/media/a.mp4");
    await recomputeScope();

    const [item] = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
    expect(item.inScope).toBe(true);
  });

  it("hides an item whose file no longer belongs to any folder", async () => {
    const id = await makeItem(libraryId, { title: "Orphan" });
    await attachFile(id, null as unknown as number, "/elsewhere/a.mp4");
    await recomputeScope();

    const [item] = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
    expect(item.inScope).toBe(false);
  });

  it("never hides a folder, which has no file of its own", async () => {
    // Any "has a file under a watched root" rule is false for every folder,
    // which would empty the folder picker entirely.
    const id = await makeFolder(libraryId);
    await recomputeScope();

    const [item] = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
    expect(item.inScope).toBe(true);
  });

  it("lets the deepest of two nested folders own a file", async () => {
    const [nested] = await db
      .insert(libraryRoots)
      .values({ libraryId, path: "/media/sub" })
      .returning();
    const id = await makeItem(libraryId, { title: "Nested" });
    await attachFile(id, null as unknown as number, "/media/sub/a.mp4");
    await recomputeScope();

    const [file] = await db.select().from(mediaFiles).where(eq(mediaFiles.mediaItemId, id));
    expect(file.rootId).toBe(nested.id);
  });

  it("does not mistake a sibling folder sharing a prefix for a child", async () => {
    // "/media" must not own "/media-other/a.mp4" — the reason matching is on
    // the path plus a slash, never a bare prefix.
    const id = await makeItem(libraryId, { title: "Sibling" });
    await attachFile(id, rootId, "/media-other/a.mp4");
    await recomputeScope();

    const [item] = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
    expect(item.inScope).toBe(false);
  });

  it("does not delete anything, so removing a folder is reversible", async () => {
    const id = await makeItem(libraryId, { title: "Hidden" });
    await attachFile(id, null as unknown as number, "/elsewhere/a.mp4");
    await recomputeScope();
    expect(await db.select().from(mediaItems)).toHaveLength(1);
  });
});

describe("purgeEmptyEntities", () => {
  it("removes a performer left with no visible items", async () => {
    // This is what cleans up a performer created by a filename typo once the
    // filename is corrected.
    const stray = await makePerformer("Typo Name");
    const kept = await makePerformer("Real Name");
    await linkPerformer(await makeItem(libraryId, { title: "X" }), kept);

    await purgeEmptyEntities();
    expect((await db.select().from(performers)).map((p) => p.name)).toEqual(["Real Name"]);
  });

  it("removes a studio no visible item uses", async () => {
    const used = await makeStudio("Kept");
    await makeStudio("Unused");
    await makeItem(libraryId, { title: "X", studioId: used });

    await purgeEmptyEntities();
    expect((await db.select().from(studios)).map((s) => s.name)).toEqual(["Kept"]);
  });

  it("keeps a performer whose items are only hidden, and does not crash", async () => {
    // Hiding is reversible — re-adding the folder must restore everything.
    // Deleting here also violated the join table's foreign key, which failed
    // the whole scan, since purge runs at the end of every one.
    const p = await makePerformer("Only Hidden");
    await linkPerformer(await makeItem(libraryId, { title: "X", inScope: false }), p);

    await expect(purgeEmptyEntities()).resolves.toBeDefined();
    expect((await db.select().from(performers)).map((r) => r.name)).toEqual(["Only Hidden"]);
  });

  it("keeps a hand-created performer who has a bio but no videos yet", async () => {
    // api/performers.ts relies on being able to create a performer before
    // their files arrive, so the filename pass can match them next scan.
    // Purging them deleted that performer — and any bio written for them —
    // on the very next scan.
    const p = await makePerformer("Written About");
    await db.update(performers).set({ bio: "Some prose." }).where(eq(performers.id, p));

    await purgeEmptyEntities();
    expect((await db.select().from(performers)).map((r) => r.name)).toEqual(["Written About"]);
  });

  it("keeps a performer with no videos but profile facts or an alias", async () => {
    // Both are typed in by hand, and an alias is often added precisely so
    // the next scan finds files filed under it.
    const facts = await makePerformer("Has Facts");
    await db.update(performers).set({ heightCm: 165 }).where(eq(performers.id, facts));
    const aliased = await makePerformer("Has Alias");
    await db.insert(performerAliases).values({ performerId: aliased, alias: "HA" });
    await makePerformer("Debris");

    await purgeEmptyEntities();
    expect((await db.select().from(performers)).map((r) => r.name).sort()).toEqual([
      "Has Alias",
      "Has Facts",
    ]);
  });

  it("still purges a performer with no videos and nothing hand-authored", async () => {
    // The case this exists for: one created from a filename typo, then
    // orphaned when the filename was corrected.
    await makePerformer("Typo Name");
    await purgeEmptyEntities();
    expect(await db.select().from(performers)).toEqual([]);
  });

  it("never purges a performer created by hand, favourited or archived", async () => {
    // All three have no items by design or by circumstance, and each is a
    // deliberate act about that performer that a scan must not undo.
    const [byHand] = await db
      .insert(performers)
      .values({ name: "Typed In", origin: "user" })
      .returning();
    // Favourited by any profile — one is enough to keep them.
    const [loved] = await db.insert(performers).values({ name: "Loved" }).returning();
    await signIn();
    await setPerformerFavoriteFor(loved.id, true);
    await db.insert(performers).values({ name: "Shelved", archivedAt: new Date() });
    await makePerformer("Debris");

    await purgeEmptyEntities();
    expect((await db.select().from(performers)).map((p) => p.name).sort()).toEqual(
      ["Loved", "Shelved", "Typed In"],
    );
    expect(byHand.origin).toBe("user");
  });

  it("keeps a studio whose items are only hidden", async () => {
    const s = await makeStudio("Hidden Studio");
    await makeItem(libraryId, { title: "X", studioId: s, inScope: false });

    await expect(purgeEmptyEntities()).resolves.toBeDefined();
    expect((await db.select().from(studios)).map((r) => r.name)).toEqual(["Hidden Studio"]);
  });
});
