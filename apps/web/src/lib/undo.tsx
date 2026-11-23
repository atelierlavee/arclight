// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useCallback } from "react";
import { useToast } from "./toast";

/**
 * Runs a reversible change and offers to put it back.
 *
 * The spec (§19) asks for non-blocking undo on the everyday edits — favourite,
 * tags, collections, watch state, metadata — rather than a confirm dialog in
 * front of each one. A dialog asks you to be sure before anything has
 * happened, which is the moment you know least; an undo lets the change land
 * and stays reachable for as long as the toast does.
 *
 * The toast layer already had the two pieces this needs: an `action` button
 * and a timer that pauses while the pointer is over the stack, so a toast
 * carrying an Undo you are reaching for cannot expire under the cursor. This
 * is only the pairing of a forward action with its inverse.
 *
 * Deliberately not a generic command stack. A stack implies undoing things in
 * order, long after the fact, and would have to reason about whether step 3
 * still makes sense once step 5 has touched the same item. One toast, one
 * inverse, live only while it is on screen — which is the window in which an
 * undo is actually a correction rather than a second edit.
 */

export type UndoableOptions<T> = {
  /**
   * Past tense, the way it reads on the toast: "Removed from Favourites".
   *
   * May be a function of what `apply` returned, for the common case where
   * which way a toggle went is only known once it has been read. "Favourite
   * updated" is true and useless — the whole question a shortcut with no
   * on-screen control raises is which way it just went.
   */
  message: string | ((applied: T) => string);
  description?: string;
  /** The change itself. Its result is handed to `revert`. */
  apply: () => Promise<T> | T;
  /**
   * Puts it back. Receives whatever `apply` returned, which is how an inverse
   * that needs the old value gets hold of it — `apply` captures it before
   * overwriting and returns it from there.
   */
  revert: (applied: T) => Promise<void> | void;
  /**
   * Runs after `apply` and again after `revert`, for cache invalidation. Both
   * directions change the same server state, so both need the same refresh —
   * having one call site do it twice is what keeps them from drifting.
   */
  onSettled?: () => void;
  /** Wording of the button. Only worth changing when "Undo" would be vague. */
  undoLabel?: string;
};

export type RunUndoable = <T>(options: UndoableOptions<T>) => Promise<void>;

export function useUndoable(): RunUndoable {
  const { toast } = useToast();

  return useCallback(
    async <T,>({
      message,
      description,
      apply,
      revert,
      onSettled,
      undoLabel = "Undo",
    }: UndoableOptions<T>) => {
      let applied: T;
      try {
        applied = await apply();
      } catch (error) {
        toast({
          title: "That didn't work",
          description:
            error instanceof Error ? error.message : "The change was not saved.",
          variant: "error",
        });
        return;
      }
      onSettled?.();

      const text = typeof message === "function" ? message(applied) : message;

      // `undone` guards the button rather than the toast being gone: the
      // toast dismisses itself the moment the action fires, but a double
      // click can land twice before React has removed the row.
      let undone = false;
      toast({
        title: text,
        description,
        variant: "success",
        action: {
          label: undoLabel,
          onClick: () => {
            if (undone) return;
            undone = true;
            void (async () => {
              try {
                await revert(applied);
                onSettled?.();
              } catch (error) {
                // A second toast rather than patching the first: the Toaster
                // dismisses a row as soon as its action fires, so by the time
                // the inverse fails there is nothing left to update.
                //
                // Reported rather than swallowed. The user has been told the
                // change is reversed, and if it isn't they need to know the
                // library is not in the state the toast just claimed.
                toast({
                  title: "Couldn't undo that",
                  description:
                    error instanceof Error
                      ? error.message
                      : "The change is still in place.",
                  variant: "error",
                });
              }
            })();
          },
        },
      });
    },
    [toast],
  );
}
