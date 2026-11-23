// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { BookmarkPlus } from "lucide-react";
import { saveSearch, suggestSearchName } from "@/lib/savedSearches";
import { useToast } from "@/lib/toast";
import type { Filters } from "@/lib/filters";

/**
 * Saves the current filtered view under a name (§7).
 *
 * Only offered when something is actually filtered — saving "the whole
 * library" is the Browse link, and a saved search that restores nothing is a
 * row in the sidebar that does nothing.
 *
 * The name is suggested from the filters rather than generated, so the list
 * does not fill up with "Saved view 1"; it stays editable because the
 * suggestion is a description and a name is a reminder.
 */
export function SaveSearchButton({
  filters,
  query,
  search,
}: {
  filters: Filters;
  query?: string;
  /** The current query string, without the leading "?". */
  search: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setName(suggestSearchName(filters, query));
    // Selected rather than just focused: the suggestion is usually right, and
    // when it isn't, typing should replace it rather than append to it.
    requestAnimationFrame(() => inputRef.current?.select());
  }, [open, filters, query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    saveSearch(trimmed, search);
    setOpen(false);
    toast({
      title: "Saved",
      description: `“${trimmed}” is in the sidebar under Saved searches.`,
      variant: "success",
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-accent"
      >
        <BookmarkPlus className="size-3.5" /> Save search
      </button>

      {open && (
        <form
          onSubmit={submit}
          className="animate-soft-pop absolute right-0 top-full z-30 mt-2 flex w-72 gap-1.5 rounded-lg border border-border bg-card p-2 shadow-2xl"
        >
          <label className="sr-only" htmlFor="saved-search-name">
            Name for this search
          </label>
          <input
            id="saved-search-name"
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name this view…"
            className="min-w-0 flex-1 rounded border border-border bg-transparent px-2 py-1 text-xs outline-none focus:border-foreground/30"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            Save
          </button>
        </form>
      )}
    </div>
  );
}
