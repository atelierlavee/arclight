// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

/**
 * The lists of collections, saved searches and pins, shared by the top bar's
 * Library menu and the phone drawer so the two can't drift apart. Their
 * other shared pieces are in lib/navData.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bookmark, Layers, Pin, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isPinned,
  pinsChangedEvent,
  readPins,
  removePin,
  togglePin,
  type Pin as PinnedItem,
} from "@/lib/pinned";
import { isMediaDrag, readMediaDragData, type MediaDragPayload } from "@/lib/dragMedia";
import { addItemsToCollection, removeItemsFromCollection } from "@/lib/bulkActions";
import { useUndoable } from "@/lib/undo";
import {
  readSavedSearches,
  removeSavedSearch,
  savedSearchesChangedEvent,
} from "@/lib/savedSearches";
import { qk } from "@/lib/queryKeys";
import { useIsOwner } from "@/lib/profile";

type Collection = { id: number; name: string; type: "manual" | "smart" };

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      {children}
    </div>
  );
}

/**
 * Collections, saved searches and pins, each a list of links.
 *
 * A manual collection takes dropped media (§13), through the same bulk
 * helper the action bar uses, with an undo — a drop is the easiest gesture in
 * the app to make by accident.
 */
export function LibraryShortcuts({
  itemClass,
  onCreate,
}: {
  itemClass: string;
  onCreate: () => void;
}) {
  const [pins, setPins] = useState<PinnedItem[]>(readPins);
  const [saved, setSaved] = useState(readSavedSearches);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const runUndoable = useUndoable();
  const queryClient = useQueryClient();
  const isOwner = useIsOwner();

  useEffect(() => {
    // "storage" covers another tab; the custom events cover this one, which
    // does not fire "storage" for its own writes.
    const refresh = () => {
      setPins(readPins());
      setSaved(readSavedSearches());
    };
    window.addEventListener(pinsChangedEvent(), refresh);
    window.addEventListener(savedSearchesChangedEvent(), refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(pinsChangedEvent(), refresh);
      window.removeEventListener(savedSearchesChangedEvent(), refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const { data: collections } = useQuery({
    queryKey: qk.collections,
    queryFn: async () => {
      const res = await fetch("/api/collections");
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return (await res.json()) as { collections: Collection[] };
    },
  });

  const deleteCollection = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete collection");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.collections }),
  });

  async function dropOnCollection(payload: MediaDragPayload, collection: Collection) {
    await runUndoable({
      message: `Added to ${collection.name}`,
      description: payload.ids.length === 1 ? payload.label : `${payload.ids.length} items`,
      apply: () => addItemsToCollection(payload.ids, collection.id, () => {}),
      revert: async () => {
        await removeItemsFromCollection(payload.ids, collection.id, () => {});
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: qk.collectionItems.all });
        queryClient.invalidateQueries({ queryKey: qk.mediaItems.all });
      },
    });
  }

  return (
    <>
      <div className="flex items-center justify-between pr-2">
        <SectionLabel>Collections</SectionLabel>
        {isOwner && (
          <button
            type="button"
            onClick={onCreate}
            aria-label="New collection"
            className="mt-3 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </div>
      {collections?.collections.length === 0 && (
        <p className="px-3 text-xs text-muted-foreground/60">None yet</p>
      )}
      {collections?.collections.map((c) => (
        <div
          key={c.id}
          className={cn(
            "group flex items-center rounded-md",
            // Only a manual collection is a drop target. A smart one is a
            // saved query — adding an item to it by hand would either do
            // nothing or quietly contradict its rule.
            dropTarget === c.id && "ring-1 ring-foreground/40",
          )}
          onDragOver={(event) => {
            if (!isOwner || c.type !== "manual" || !isMediaDrag(event.dataTransfer)) return;
            // Both are required: without preventDefault the browser refuses
            // the drop, and the drop handler never runs.
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDropTarget(c.id);
          }}
          onDragLeave={() => setDropTarget((current) => (current === c.id ? null : current))}
          onDrop={(event) => {
            if (!isOwner || c.type !== "manual") return;
            event.preventDefault();
            setDropTarget(null);
            const payload = readMediaDragData(event.dataTransfer);
            if (payload) void dropOnCollection(payload, c);
          }}
        >
          <Link
            to="/browse"
            search={{ collectionId: c.id }}
            className={cn(itemClass, "flex-1 truncate")}
            activeProps={{ className: "text-foreground" }}
          >
            <Layers className="size-4 shrink-0" />
            <span className="truncate">{c.name}</span>
          </Link>
          <button
            type="button"
            onClick={() =>
              togglePin({
                id: `collection:${c.id}`,
                type: "collection",
                label: c.name,
                collectionId: c.id,
              })
            }
            aria-label={`${isPinned(`collection:${c.id}`) ? "Unpin" : "Pin"} ${c.name}`}
            className="hidden rounded p-1 text-muted-foreground hover:text-foreground group-hover:block"
          >
            <Pin className={cn("size-3.5", isPinned(`collection:${c.id}`) && "fill-current")} />
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={() => deleteCollection.mutate(c.id)}
              aria-label={`Delete ${c.name}`}
              className="hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      ))}

      {saved.length > 0 && (
        <>
          <SectionLabel>Saved searches</SectionLabel>
          {saved.map((entry) => (
            <div key={entry.id} className="group flex items-center">
              <Link
                to="/browse"
                // Parsed back into a search object rather than navigated to
                // as a raw href: the router owns the shape of this route's
                // search, and handing it a string would skip its validation.
                search={Object.fromEntries(new URLSearchParams(entry.search))}
                className={cn(itemClass, "min-w-0 flex-1 truncate")}
                title={entry.name}
              >
                <Bookmark className="size-4 shrink-0" />
                <span className="truncate">{entry.name}</span>
              </Link>
              <button
                type="button"
                onClick={() => removeSavedSearch(entry.id)}
                aria-label={`Delete saved search ${entry.name}`}
                className="hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </>
      )}

      {pins.length > 0 && (
        <>
          <SectionLabel>Pinned</SectionLabel>
          {pins.map((pin) => (
            <div key={pin.id} className="group flex items-center">
              {pin.type === "performer" ? (
                <Link
                  to="/performer/$performerId"
                  params={{ performerId: String(pin.performerId) }}
                  className={cn(itemClass, "min-w-0 flex-1 truncate")}
                >
                  <Pin className="size-4 shrink-0" /> <span className="truncate">{pin.label}</span>
                </Link>
              ) : pin.type === "studio" ? (
                <Link
                  to="/studio/$studioId"
                  params={{ studioId: String(pin.studioId) }}
                  className={cn(itemClass, "min-w-0 flex-1 truncate")}
                >
                  <Pin className="size-4 shrink-0" /> <span className="truncate">{pin.label}</span>
                </Link>
              ) : (
                <Link
                  to="/browse"
                  search={
                    pin.type === "collection"
                      ? { collectionId: pin.collectionId }
                      : { parentId: pin.folderId }
                  }
                  className={cn(itemClass, "min-w-0 flex-1 truncate")}
                >
                  <Pin className="size-4 shrink-0" /> <span className="truncate">{pin.label}</span>
                </Link>
              )}
              <button
                type="button"
                onClick={() => removePin(pin.id)}
                aria-label={`Unpin ${pin.label}`}
                className="hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </>
      )}
    </>
  );
}
