// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bookmark, Folder, Layers, Tv, Users } from "lucide-react";
import { readPins, pinsChangedEvent, type Pin as PinnedItem } from "@/lib/pinned";
import {
  readSavedSearches,
  savedSearchesChangedEvent,
  type SavedSearch,
} from "@/lib/savedSearches";

/**
 * Pinned destinations on the home page (§8's "Pinned Home").
 *
 * Links rather than tiles, because a pin is a performer, a studio, a folder,
 * a collection or a saved search — five things with no artwork in common.
 * Rendering them as media tiles would mean five thumbnail strategies and a
 * row of placeholder boxes for whichever ones have no picture.
 *
 * Saved searches are included here rather than getting a row of their own:
 * both are "a place I keep coming back to", and two near-identical rows of
 * shortcuts is the sort of clutter §28 exists to prevent.
 */
export function PinnedRow() {
  const [pins, setPins] = useState<PinnedItem[]>(readPins);
  const [saved, setSaved] = useState<SavedSearch[]>(readSavedSearches);

  useEffect(() => {
    const refresh = () => {
      setPins(readPins());
      setSaved(readSavedSearches());
    };
    refresh();
    window.addEventListener(pinsChangedEvent(), refresh);
    window.addEventListener(savedSearchesChangedEvent(), refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(pinsChangedEvent(), refresh);
      window.removeEventListener(savedSearchesChangedEvent(), refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Hidden when empty, like every other home row.
  if (pins.length === 0 && saved.length === 0) return null;

  const chipClass =
    "flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-sm transition-colors hover:bg-accent";

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">Pinned</h2>
      <div className="flex flex-wrap gap-2">
        {pins.map((pin) =>
          pin.type === "performer" ? (
            <Link
              key={pin.id}
              to="/performer/$performerId"
              params={{ performerId: String(pin.performerId) }}
              className={chipClass}
            >
              <Users className="size-4 shrink-0 text-muted-foreground" />
              <span className="sensitive truncate">{pin.label}</span>
            </Link>
          ) : pin.type === "studio" ? (
            <Link
              key={pin.id}
              to="/studio/$studioId"
              params={{ studioId: String(pin.studioId) }}
              className={chipClass}
            >
              <Tv className="size-4 shrink-0 text-muted-foreground" />
              <span className="sensitive truncate">{pin.label}</span>
            </Link>
          ) : (
            <Link
              key={pin.id}
              to="/browse"
              search={
                pin.type === "collection"
                  ? { collectionId: pin.collectionId }
                  : { parentId: pin.folderId }
              }
              className={chipClass}
            >
              {pin.type === "collection" ? (
                <Layers className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <Folder className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="sensitive truncate">{pin.label}</span>
            </Link>
          ),
        )}

        {saved.map((entry) => (
          <Link
            key={entry.id}
            to="/browse"
            // Parsed into a search object rather than used as a raw href: the
            // route owns the shape of its own search, and a string would skip
            // its validation.
            search={Object.fromEntries(new URLSearchParams(entry.search))}
            className={chipClass}
          >
            <Bookmark className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{entry.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
