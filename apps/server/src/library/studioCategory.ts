// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { categories, mediaItems, studios } from "../db/schema.js";
import { studioDescendantIds } from "./hierarchy.js";

/**
 * Filing videos into categories by studio.
 *
 * Each studio can name a default category (a home tile). A studio without
 * one defers to its network, and so on up; with none anywhere, videos go to
 * the first category. Only videos whose category the scanner still owns
 * (`kindSource = 'scanner'`) are ever moved — one you filed by hand stays
 * where you put it.
 */

/** How far up a network chain to look; a restore could bring back a loop. */
const MAX_DEPTH = 10;

/** The first category by position: where anything without a default goes. */
async function firstCategorySlug(): Promise<string | null> {
  const [first] = await db
    .select({ slug: categories.slug })
    .from(categories)
    .orderBy(asc(categories.position), asc(categories.id))
    .limit(1);
  return first?.slug ?? null;
}

/**
 * The category slug a studio's videos belong in: its own default, else its
 * network's, else the first category. Null only with no categories at all.
 */
export async function categoryForStudio(studioId: number | null): Promise<string | null> {
  const seen = new Set<number>();
  let current = studioId;
  while (current !== null && !seen.has(current) && seen.size < MAX_DEPTH) {
    seen.add(current);
    const [row] = await db
      .select({ parentId: studios.parentId, slug: categories.slug })
      .from(studios)
      .leftJoin(categories, eq(categories.id, studios.defaultCategoryId))
      .where(eq(studios.id, current));
    if (!row) break;
    if (row.slug) return row.slug;
    current = row.parentId;
  }
  return firstCategorySlug();
}

/** Files these items by their studio, leaving any you filed by hand alone. */
export async function fileByStudio(itemIds: number[]): Promise<void> {
  if (itemIds.length === 0) return;
  const rows = await db
    .select({ id: mediaItems.id, studioId: mediaItems.studioId, kind: mediaItems.kind })
    .from(mediaItems)
    .where(and(inArray(mediaItems.id, itemIds), eq(mediaItems.kindSource, "scanner")));

  const targetFor = new Map<number | null, string | null>();
  for (const row of rows) {
    if (!targetFor.has(row.studioId)) targetFor.set(row.studioId, await categoryForStudio(row.studioId));
    const target = targetFor.get(row.studioId);
    if (!target || target === row.kind) continue;
    await db
      .update(mediaItems)
      .set({ kind: target })
      .where(and(eq(mediaItems.id, row.id), eq(mediaItems.kindSource, "scanner")));
  }
}

/**
 * Re-files every video of a studio and of the sites under it, after its
 * default (or its place in a network) changed. One update per studio, since
 * a site with its own default keeps it rather than taking the network's.
 * Returns how many videos moved.
 */
export async function refileStudio(studioId: number): Promise<number> {
  const ids = [studioId, ...(await studioDescendantIds(studioId))];
  let moved = 0;
  for (const id of ids) {
    const target = await categoryForStudio(id);
    if (!target) continue;
    const updated = await db
      .update(mediaItems)
      .set({ kind: target })
      .where(
        and(eq(mediaItems.studioId, id), eq(mediaItems.kindSource, "scanner"), ne(mediaItems.kind, target)),
      )
      .returning({ id: mediaItems.id });
    moved += updated.length;
  }
  return moved;
}
