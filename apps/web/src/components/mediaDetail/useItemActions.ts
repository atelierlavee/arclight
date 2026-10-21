import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FramingValue } from "../FramingEditor";
import { setWatched, updateItem } from "@/lib/mediaItemApi";
import { useUndoable } from "@/lib/undo";
import { qk } from "@/lib/queryKeys";
import { invalidateItem, invalidateItemEverywhere, invalidateItemWatchState } from "@/lib/invalidate";

/**
 * The writes the modal makes to the item it is showing: its category,
 * favourite and watched flags, and the thumbnail framing.
 */
export function useItemActions({
  viewingId,
  title,
  onFramingSaved,
}: {
  viewingId: number;
  title: string | undefined;
  onFramingSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const runUndoable = useUndoable();

  const updateKind = useMutation({
    mutationFn: (kind: string) => updateItem(viewingId, { kind }),
    onSuccess: () => {
      invalidateItem(queryClient, viewingId);
      // The home page tiles show per-category counts, and they read
      // ["categories"] — invalidating ["kinds"] refreshed nothing, since no
      // component has used that key since categories became editable data.
      queryClient.invalidateQueries({ queryKey: qk.categories });
    },
  });

  /**
   * Favourite, with an undo rather than a confirmation (§19).
   *
   * A mis-click on a heart is trivially reversible and a dialog in front of
   * it would be absurd, so this is exactly the case the undo toast exists
   * for. The previous value is captured before the write and handed to the
   * inverse, so undoing restores what was actually there rather than
   * toggling again — which would be the opposite of what the toast says on a
   * double press.
   */
  function toggleFavorite(next: boolean) {
    void runUndoable({
      message: next ? "Added to Favourites" : "Removed from Favourites",
      description: title,
      apply: async () => {
        await updateItem(viewingId, { isFavorite: next });
        return !next;
      },
      revert: (previous) => updateItem(viewingId, { isFavorite: previous }),
      onSettled: () => {
        invalidateItem(queryClient, viewingId);
      },
    });
  }
  const saveFraming = useMutation({
    mutationFn: (next: FramingValue) =>
      updateItem(viewingId, {
        thumbnailPositionX: next.x,
        thumbnailPositionY: next.y,
        thumbnailScale: next.scale,
      }),
    onSuccess: () => {
      // Every surface showing this thumbnail has to repaint, not just the modal.
      invalidateItemEverywhere(queryClient, viewingId);
      onFramingSaved();
    },
  });

  const toggleWatched = useMutation({
    mutationFn: (next: boolean) => setWatched(viewingId, next),
    onSuccess: () => {
      // Marking something watched is exactly what should drop it out of
      // Continue Watching (and the performer page's in-progress row), so
      // those rows have to refetch.
      invalidateItemWatchState(queryClient, viewingId);
    },
  });

  return { updateKind, toggleFavorite, saveFraming, toggleWatched };
}
