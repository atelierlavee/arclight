import { eq, sql } from "drizzle-orm";
import { db } from "./client.js";
import { appSettings, categories, libraries, libraryRoots, mediaItemTypes } from "./schema.js";

const MEDIA_ITEM_TYPES = ["video", "photo", "folder"] as const;

export async function seed(): Promise<void> {
  for (const name of MEDIA_ITEM_TYPES) {
    const existing = await db
      .select()
      .from(mediaItemTypes)
      .where(eq(mediaItemTypes.name, name));
    if (existing.length === 0) {
      await db.insert(mediaItemTypes).values({ name });
    }
  }

  const mediaRoot = process.env.MEDIA_ROOT;
  if (!mediaRoot) return;

  // Only on a genuinely empty library. This used to look for a root matching
  // MEDIA_ROOT specifically and recreate it when absent — so removing that
  // folder in Site settings lasted exactly until the next restart, which put
  // it back along with another "Library" row every time. Six of them
  // accumulated before anyone noticed.
  //
  // Seeding is for a first run. Once any folder is configured, the set is
  // the user's to manage and re-asserting a default can only fight them.
  // Same rule as seedCategories below, for the same reason.
  const [existing] = await db.select({ count: sql<number>`count(*)::int` }).from(libraryRoots);
  if ((existing?.count ?? 0) > 0) return;

  const [library] = await db
    .insert(libraries)
    .values({ name: "Library" })
    .returning();

  await db.insert(libraryRoots).values({
    libraryId: library.id,
    path: mediaRoot,
  });
}

/**
 * The three categories the app ships with. Seeded rather than hardcoded so
 * they can be edited or removed later; only inserted when absent, so renaming
 * "Videos" doesn't get undone on the next boot.
 *
 * Seeding only ever runs on an empty table. `onConflictDoNothing` guards the
 * slug alone, which wasn't enough: creating a category named "Movies" picks
 * the slug `movies`, the seeded `movie` doesn't collide with it, and the next
 * boot re-added a second tile with the identical label. Once any category
 * exists the set is the user's to manage, and re-asserting defaults into it
 * can only fight them.
 *
 * "Empty" is not enough on its own, because deleting every category leaves it
 * empty too, and the defaults came straight back on the next boot. A flag in
 * app_settings records that seeding has been dealt with; installs that already
 * have categories get it set without inserting anything.
 */
export async function seedCategories(): Promise<void> {
  const [done] = await db.select().from(appSettings).where(eq(appSettings.key, "categories_seeded"));
  if (done) return;

  const markSeeded = () =>
    db.insert(appSettings).values({ key: "categories_seeded", value: true }).onConflictDoNothing();

  const [existing] = await db.select({ count: sql<number>`count(*)::int` }).from(categories);
  if ((existing?.count ?? 0) > 0) {
    await markSeeded();
    return;
  }

  await db.insert(categories).values([
    { slug: "video", label: "Videos", position: 0 },
    { slug: "movie", label: "Movies", position: 1 },
    { slug: "series", label: "Series", position: 2 },
  ]);
  await markSeeded();
}
