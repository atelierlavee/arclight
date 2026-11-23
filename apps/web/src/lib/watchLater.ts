// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setWatchLater } from "./mediaItemApi";
import { invalidateItem } from "./invalidate";
import { useUndoable } from "./undo";

/**
 * Saves an item to Watch Later or takes it off, with an undo toast.
 *
 * One hook for the tile menu and the player, so both say the same thing and
 * refresh the same lists. `invalidateItem` covers the home row and the
 * browse filter, which are both media-item lists.
 */
export function useToggleWatchLater() {
  const queryClient = useQueryClient();
  const runUndoable = useUndoable();

  return useCallback(
    (item: { id: number; title?: string }, next: boolean) =>
      runUndoable({
        message: next ? "Saved to Watch Later" : "Removed from Watch Later",
        description: item.title,
        apply: async () => {
          await setWatchLater(item.id, next);
          return !next;
        },
        revert: (previous) => setWatchLater(item.id, previous),
        onSettled: () => invalidateItem(queryClient, item.id),
      }),
    [queryClient, runUndoable],
  );
}
