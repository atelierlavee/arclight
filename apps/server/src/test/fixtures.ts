import { db } from "../db/client.js";
import {
  libraries,
  libraryRoots,
  mediaFiles,
  mediaItemPerformers,
  mediaItemTags,
  mediaItemTypes,
  mediaItems,
  performers,
  studios,
  tags,
} from "../db/schema.js";
import { eq } from "drizzle-orm";
import { profileItemState, profilePerformerState, profiles } from "../db/schema.js";

/**
 * Builders for the rows a route needs to have something to return.
 *
 * Written as functions rather than a fixed dataset so each test states the
 * shape it depends on. A shared "seed everything" fixture makes tests pass
 * for reasons the test doesn't mention, which is how a suite stops explaining
 * its own failures.
 */

/** A library whose root is a real directory, for tests that stream files. */
export async function makeLibraryAt(
  rootPath: string
): Promise<{ libraryId: number; rootId: number }> {
  const [library] = await db.insert(libraries).values({ name: "Disk" }).returning();
  const [root] = await db
    .insert(libraryRoots)
    .values({ libraryId: library.id, path: rootPath })
    .returning();
  return { libraryId: library.id, rootId: root.id };
}

export async function makeLibrary(): Promise<{ libraryId: number; rootId: number }> {
  const [library] = await db.insert(libraries).values({ name: "Test" }).returning();
  const [root] = await db
    .insert(libraryRoots)
    .values({ libraryId: library.id, path: "/media" })
    .returning();
  return { libraryId: library.id, rootId: root.id };
}

async function typeId(name: string): Promise<number> {
  const [row] = await db.select().from(mediaItemTypes).where(eq(mediaItemTypes.name, name));
  if (row) return row.id;
  const [created] = await db.insert(mediaItemTypes).values({ name }).returning();
  return created.id;
}

/** Per-profile state a test can give an item at creation (the owner's). */
type ItemState = { isFavorite?: boolean; rating?: number | null; hiddenAt?: Date | null };

export async function makeItem(
  libraryId: number,
  overrides: Partial<typeof mediaItems.$inferInsert> & ItemState = {}
): Promise<number> {
  // Favourite, rating and hidden moved to profile_item_state; accepted here
  // still so a test reads as before, and written for the owner profile.
  const { isFavorite, rating, hiddenAt, ...columns } = overrides;
  const [item] = await db
    .insert(mediaItems)
    .values({
      libraryId,
      itemTypeId: await typeId("video"),
      title: "A Video",
      ...columns,
    })
    .returning();
  const state: ItemState = {};
  if (isFavorite !== undefined) state.isFavorite = isFavorite;
  if (rating !== undefined) state.rating = rating;
  if (hiddenAt !== undefined) state.hiddenAt = hiddenAt;
  if (Object.keys(state).length > 0) await setItemStateFor(item.id, state);
  return item.id;
}

export async function makePhoto(libraryId: number, title = "A Photo"): Promise<number> {
  const [item] = await db
    .insert(mediaItems)
    .values({ libraryId, itemTypeId: await typeId("photo"), title })
    .returning();
  return item.id;
}

export async function makeFolder(libraryId: number, title = "A Folder"): Promise<number> {
  const [item] = await db
    .insert(mediaItems)
    .values({ libraryId, itemTypeId: await typeId("folder"), title })
    .returning();
  return item.id;
}

export async function attachFile(
  mediaItemId: number,
  rootId: number,
  path: string,
  contentHash: string | null = null,
  sizeBytes = 1000
): Promise<void> {
  await db.insert(mediaFiles).values({
    mediaItemId,
    rootId,
    path,
    sizeBytes,
    mtime: new Date(),
    mimeType: "video/mp4",
    contentHash,
  });
}

export async function makePerformer(name: string): Promise<number> {
  const [row] = await db.insert(performers).values({ name }).returning();
  return row.id;
}

export async function linkPerformer(mediaItemId: number, performerId: number): Promise<void> {
  await db.insert(mediaItemPerformers).values({ mediaItemId, performerId }).onConflictDoNothing();
}

export async function makeTag(name: string): Promise<number> {
  const [row] = await db.insert(tags).values({ name }).returning();
  return row.id;
}

export async function linkTag(mediaItemId: number, tagId: number): Promise<void> {
  await db.insert(mediaItemTags).values({ mediaItemId, tagId }).onConflictDoNothing();
}

export async function makeStudio(name: string): Promise<number> {
  const [row] = await db.insert(studios).values({ name }).returning();
  return row.id;
}

/**
 * Favourite / rating / hidden for one item, as one profile — the owner's by
 * default (the profile `signIn()` acts as). These used to be columns on
 * media_items and were set through `makeItem` overrides.
 */
export async function setItemStateFor(
  mediaItemId: number,
  state: { isFavorite?: boolean; rating?: number | null; hiddenAt?: Date | null },
  profileId?: number,
): Promise<void> {
  const pid = profileId ?? (await ownerProfileId());
  await db
    .insert(profileItemState)
    .values({ profileId: pid, mediaItemId, ...state })
    .onConflictDoUpdate({ target: [profileItemState.profileId, profileItemState.mediaItemId], set: state });
}

export async function setPerformerFavoriteFor(performerId: number, isFavorite: boolean, profileId?: number) {
  const pid = profileId ?? (await ownerProfileId());
  await db
    .insert(profilePerformerState)
    .values({ profileId: pid, performerId, isFavorite })
    .onConflictDoUpdate({
      target: [profilePerformerState.profileId, profilePerformerState.performerId],
      set: { isFavorite },
    });
}

/** The owner profile `signIn()` created. Throws when nobody signed in. */
export async function ownerProfileId(): Promise<number> {
  const [owner] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.isOwner, true));
  if (!owner) throw new Error("ownerProfileId(): call signIn() first");
  return owner.id;
}
