// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EditDialog } from "./EditDialog";
import { EDIT_INPUT } from "@/lib/editForm";
import { updateItem } from "@/lib/mediaItemApi";
import { fetchStudios } from "@/lib/studioApi";
import { suggestedFilename } from "@/lib/suggestedFilename";
import { invalidateItemEverywhere } from "@/lib/invalidate";
import { qk } from "@/lib/queryKeys";

/**
 * What a filename needs that the item does not have yet.
 *
 * The scanner only reads a name that starts with `[Studio]`, so an item with
 * no studio (a StashDB studio your library lacks is left unticked) cannot be
 * given one. This asks for the missing pieces, saves them on the item, and
 * copies the finished name.
 */
export function FilenameDetailsDialog({
  itemId,
  studio,
  title,
  releaseDate,
  performers,
  fileName,
  onClose,
}: {
  itemId: number;
  studio: string | null;
  title: string;
  releaseDate: string | null;
  performers: string[];
  fileName: string | null;
  onClose: () => void;
}) {
  const [studioValue, setStudioValue] = useState(studio ?? "");
  const [titleValue, setTitleValue] = useState(title);
  const [dateValue, setDateValue] = useState(releaseDate?.slice(0, 10) ?? "");
  const queryClient = useQueryClient();
  const listId = useId();

  // Suggestions only: a studio that is not in the library yet is created by typing it.
  const { data: studios } = useQuery({ queryKey: qk.studios.all, queryFn: fetchStudios });

  const name = suggestedFilename({
    studio: studioValue,
    performers,
    date: dateValue || null,
    title: titleValue,
    currentName: fileName,
  });

  const save = useMutation({
    mutationFn: () => {
      const patch: Parameters<typeof updateItem>[1] = {};
      if (studioValue.trim() !== (studio ?? "")) patch.studio = studioValue.trim() || null;
      if (titleValue.trim() !== title) patch.title = titleValue.trim();
      // A blank date never clears one the item already has.
      if (dateValue && dateValue !== releaseDate?.slice(0, 10)) patch.releaseDate = dateValue;
      return Object.keys(patch).length > 0 ? updateItem(itemId, patch) : Promise.resolve();
    },
    onSuccess: () => {
      invalidateItemEverywhere(queryClient, itemId);
      void queryClient.invalidateQueries({ queryKey: qk.inbox.all });
      void queryClient.invalidateQueries({ queryKey: qk.studios.all });
      onClose();
    },
  });

  function saveAndCopy() {
    if (!name) return;
    // Written here, inside the click, while the browser still counts it as the
    // user's own action; after the save returns it may no longer be allowed.
    void navigator.clipboard?.writeText(name).catch(() => {});
    save.mutate();
  }

  return (
    <EditDialog title="Fill in the missing details" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          saveAndCopy();
        }}
      >
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Studio (required)</span>
          <input
            value={studioValue}
            onChange={(event) => setStudioValue(event.target.value)}
            list={listId}
            autoFocus={!studio}
            className={EDIT_INPUT}
            aria-label="Studio"
          />
          <datalist id={listId}>
            {(studios?.studios ?? []).map((row) => (
              <option key={row.id} value={row.name} />
            ))}
          </datalist>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Release date (optional)</span>
          <input
            type="date"
            value={dateValue}
            onChange={(event) => setDateValue(event.target.value)}
            className={EDIT_INPUT}
            aria-label="Release date"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Title</span>
          <input
            value={titleValue}
            onChange={(event) => setTitleValue(event.target.value)}
            className={EDIT_INPUT}
            aria-label="Title"
          />
        </label>

        <div className="rounded-md bg-muted px-2.5 py-2">
          <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">Filename</span>
          {name ? (
            <code className="block break-all text-sm">{name}</code>
          ) : (
            <span className="text-sm text-muted-foreground">Enter a studio and a title to see it.</span>
          )}
        </div>

        {save.error && <p className="text-xs text-destructive">{save.error.message}</p>}

        <button
          type="submit"
          disabled={!name || save.isPending}
          className="w-full rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          Save &amp; copy
        </button>
      </form>
    </EditDialog>
  );
}
