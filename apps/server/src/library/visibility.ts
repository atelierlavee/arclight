import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { db } from "../db/client.js";
import { mediaItems } from "../db/schema.js";
import { unlockKey } from "../auth/profileContext.js";
import { isVaultUnlocked } from "../auth/vaultUnlock.js";
import { itemNotHidden } from "./profileState.js";

/**
 * The condition every list of media has to satisfy.
 *
 * Two things hide an item: a folder that is no longer being scanned
 * (`inScope`), and a file that has gone from disk (`missingSince`). They were
 * applied separately, and inconsistently — performers and studios filtered
 * missing items out, the main library grid and search did not, so the same
 * video was absent from one page and present with a red badge on another.
 *
 * A missing item is not deleted. It still exists, still holds its tags and
 * performers, and is still counted by library health — it simply stops
 * appearing in the places you browse, because there is nothing behind it to
 * play. The one screen that deliberately shows them is the missing-videos
 * manager, which asks for them by name rather than going through here.
 */
export function visibleItems(profileId: number): SQL {
  // Hidden is per profile (profile_item_state.hidden_at): what A put in A's
  // vault is still an ordinary item to B.
  //
  // Non-null assertion is safe and deliberate: `and` only returns undefined
  // when given no defined conditions, and all of these are constants.
  return and(
    eq(mediaItems.inScope, true),
    isNull(mediaItems.missingSince),
    itemNotHidden(profileId, mediaItems.id),
  )!;
}

/** Just the "file is still there" half, for queries that scope differently. */
export function notMissing(): SQL {
  return isNull(mediaItems.missingSince);
}

/** Just the "not in the vault" half, for history that outlives a file but not a hide. */
export function notHidden(profileId: number): SQL {
  return itemNotHidden(profileId, mediaItems.id);
}

/**
 * `visibleItems()` for hand-written SQL, against a `media_items` alias.
 *
 * The raw queries (storage, duplicates, performer network) used to spell the
 * rule out themselves, and every one of them was written before the vault
 * existed — so every one of them leaked hidden items. Routing them through
 * here means the next column that hides an item is added in one place.
 *
 * The alias is interpolated, not bound, so it is checked against a plain
 * identifier pattern rather than trusted.
 */
export function visibleItemsSql(alias: string, profileId: number): SQL {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`Bad table alias: ${alias}`);
  return sql`(${sql.raw(`${alias}.in_scope = true and ${alias}.missing_since is null`)} and ${itemNotHidden(
    profileId,
    sql.raw(`${alias}.id`),
  )})`;
}

/**
 * Whether this request may open a vault item by id.
 *
 * Lists leave hidden items out unconditionally (see `visibleItems`), but an
 * id is guessable — they are sequential — so every by-id route has to ask
 * this too, or the vault is a filter on the grid and nothing more. Mirrors
 * GET /api/vault/items: only a session that has opened the vault passes.
 */
export function canSeeHidden(request: FastifyRequest): boolean {
  return isVaultUnlocked(unlockKey(request));
}

/**
 * The current profile's id for visibility purposes. A request with no
 * profile (a cast token's stream) gets -1: no profile has that id, so
 * nothing counts as hidden for it — the cast token itself is what scopes it.
 */
export function viewerProfile(request: FastifyRequest): number {
  return request.profile?.id ?? -1;
}

/**
 * The by-id half of the rule, to `and()` into a lookup: nothing for a session
 * with the vault open, "not hidden" for everyone else. Undefined is dropped
 * by `and`, so it reads `and(eq(mediaItems.id, id), hiddenGate(request))`.
 */
export function hiddenGate(request: FastifyRequest): SQL | undefined {
  return canSeeHidden(request) ? undefined : itemNotHidden(viewerProfile(request), mediaItems.id);
}

/**
 * For routes that are about an item without selecting it (its bookmarks, its
 * heatmap): false when it does not exist or is hidden from this session, so
 * the caller answers 404 either way and a hidden id looks like a missing one.
 */
export async function itemReachable(request: FastifyRequest, id: number): Promise<boolean> {
  if (!Number.isInteger(id)) return false;
  const [row] = await db
    .select({ id: mediaItems.id })
    .from(mediaItems)
    .where(and(eq(mediaItems.id, id), hiddenGate(request)));
  return row !== undefined;
}
