import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { qk } from "./queryKeys";

/**
 * Grouped invalidations that more than one mutation needs.
 *
 * Each list here used to be hand-rolled at every call site, and the copies
 * drifted: one forgot Related items, another the performer page's in-progress
 * row. Keeping the list in one function is what keeps them the same.
 */

/** Invalidates each key (by prefix). Fire-and-forget, like the call sites. */
export function invalidateKeys(queryClient: QueryClient, keys: readonly QueryKey[]): void {
  for (const queryKey of keys) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

/**
 * After a write to one item's own fields (title, folder, studio, tags...):
 * its detail and every grid or home row that lists it.
 */
export function invalidateItem(queryClient: QueryClient, id: number): void {
  invalidateKeys(queryClient, [qk.mediaItem.detail(id), qk.mediaItems.all]);
}

/**
 * After an item's favourite or watched state changes: on top of
 * {@link invalidateItem}, the two "in progress" rows, which an item enters or
 * leaves on exactly this kind of write.
 */
export function invalidateItemWatchState(queryClient: QueryClient, id: number): void {
  invalidateKeys(queryClient, [
    qk.mediaItem.detail(id),
    qk.mediaItems.all,
    qk.continueWatching,
    qk.performerInProgress.all,
  ]);
}

/**
 * Every surface that can draw an item: the grids, every home row, the hero,
 * Related, the performer page rows, search, the timeline and the stats.
 *
 * Pass an id for one item; leave it out to refresh every item's detail (a
 * bulk action over many ids).
 */
export function invalidateItemEverywhere(queryClient: QueryClient, id?: number): void {
  invalidateKeys(queryClient, [
    qk.mediaItems.all,
    id === undefined ? qk.mediaItem.all : qk.mediaItem.detail(id),
    qk.collectionItems.all,
    qk.continueWatching,
    qk.onThisDay,
    qk.forgottenGems,
    qk.dailyPick.all,
    qk.heroItems,
    qk.relatedItems.all,
    qk.performerVideos.all,
    qk.performerInProgress.all,
    qk.searchSuggestions.all,
    qk.libraryBrowse.all,
    qk.timeline,
    qk.playSurface.all,
    qk.libraryStats,
  ]);
}

/**
 * After a write to a performer (portrait, framing, favourite, archive): their
 * page and every list, row and network view that shows them.
 */
export function invalidatePerformer(queryClient: QueryClient, id: number | string): void {
  invalidateKeys(queryClient, [qk.performer.detail(id), qk.performers.all]);
}
