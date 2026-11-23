// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { EditDialog, SaveButton } from "./EditDialog";
import { EDIT_INPUT } from "@/lib/editForm";
import {
  saveTags,
  savePerformers,
  updateItem,
  type MediaItemDetail,
} from "@/lib/mediaItemApi";
import { searchStashDbScenes, type StashDbName, type StashDbScene } from "@/lib/stashdbApi";
import { invalidateItemEverywhere } from "@/lib/invalidate";
import { qk } from "@/lib/queryKeys";

/**
 * Look a video up on StashDB by title and copy chosen details onto it.
 *
 * Two steps, like the performer lookup: pick the match, then tick what to
 * copy. Gaps are ticked by default and anything already filled in is left
 * alone until ticked. Performers, tags and a studio that the library does not
 * have yet are marked "new" and unticked: applying them would create them.
 * Nothing is written until you apply.
 */
export function StashDbSceneDialog({
  item,
  onClose,
}: {
  item: MediaItemDetail;
  onClose: () => void;
}) {
  const [term, setTerm] = useState(item.title);
  const [searched, setSearched] = useState(item.title);
  const [match, setMatch] = useState<StashDbScene | null>(null);

  const results = useQuery({
    queryKey: qk.stashDbScenes(searched),
    queryFn: () => searchStashDbScenes(searched),
    // A request to someone else's server: once per search, not refreshed.
    staleTime: Infinity,
    retry: false,
  });

  return (
    <EditDialog title="StashDB lookup" onClose={onClose}>
      {match ? (
        <ApplyStep item={item} match={match} onBack={() => setMatch(null)} onDone={onClose} />
      ) : (
        <div className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (term.trim()) setSearched(term.trim());
            }}
          >
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              className={EDIT_INPUT}
              aria-label="Title to look up"
            />
            <button
              type="submit"
              className="shrink-0 rounded-md bg-secondary px-3 text-sm transition-colors hover:bg-accent"
            >
              Search
            </button>
          </form>

          {results.isFetching ? (
            <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
          ) : results.error ? (
            <p className="text-xs text-destructive">{results.error.message}</p>
          ) : results.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing on StashDB with that title. Try fewer words.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {results.data?.map((candidate) => (
                <li key={candidate.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMatch(candidate)}
                    className="min-w-0 flex-1 rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <span className="block truncate text-sm font-medium">
                      {candidate.title ?? "Untitled"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {[
                        candidate.studio?.name,
                        candidate.date,
                        candidate.performers.map((p) => p.name).join(", "),
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No details"}
                    </span>
                  </button>
                  <a
                    href={candidate.url}
                    target="_blank"
                    rel="noreferrer"
                    title="Open on StashDB"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </EditDialog>
  );
}

function ApplyStep({
  item,
  match,
  onBack,
  onDone,
}: {
  item: MediaItemDetail;
  match: StashDbScene;
  onBack: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();

  const has = (names: string[], name: string) =>
    names.some((existing) => existing.toLowerCase() === name.toLowerCase());
  // Only what the video does not already have.
  const newPerformers = match.performers.filter(
    (p) => !has(item.performers.map((x) => x.name), p.name),
  );
  const newTags = match.tags.filter((t) => !has(item.tags.map((x) => x.name), t.name));
  const showTitle = !!match.title && match.title !== item.title;
  const showDetails = !!match.details && match.details !== item.description;
  // StashDB can give a partial date ("2018" or "2018-12"); only a full one is a day.
  const matchDate = match.date && /^\d{4}-\d{2}-\d{2}$/.test(match.date) ? match.date : null;
  const showDate = !!matchDate && matchDate !== (item.releaseDate ?? "").slice(0, 10);
  const showStudio =
    !!match.studio && match.studio.name.toLowerCase() !== (item.studio ?? "").toLowerCase();

  // Keys: "title", "details", "studio", "p:<name>", "t:<name>".
  // Ticked by default: gaps, and names the library already has. A different
  // title or details is a decision; a name that would be created is another.
  const [ticked, setTicked] = useState(() => {
    const start = new Set<string>();
    if (showDetails && !item.description) start.add("details");
    if (showDate && !item.releaseDate) start.add("date");
    if (showStudio && !item.studio && match.studio?.inLibrary) start.add("studio");
    for (const p of newPerformers) if (p.inLibrary) start.add(`p:${p.name}`);
    for (const t of newTags) if (t.inLibrary) start.add(`t:${t.name}`);
    return start;
  });

  // Everything offered, for the select-all control.
  const allKeys = [
    ...(showTitle ? ["title"] : []),
    ...(showDetails ? ["details"] : []),
    ...(showDate ? ["date"] : []),
    ...(showStudio ? ["studio"] : []),
    ...newPerformers.map((p) => `p:${p.name}`),
    ...newTags.map((t) => `t:${t.name}`),
  ];
  const allTicked = allKeys.length > 0 && allKeys.every((key) => ticked.has(key));

  const toggle = (key: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const apply = useMutation({
    mutationFn: async () => {
      const patch: Parameters<typeof updateItem>[1] = {};
      if (ticked.has("title") && match.title) patch.title = match.title;
      if (ticked.has("details")) patch.description = match.details;
      if (ticked.has("date") && matchDate) patch.releaseDate = matchDate;
      if (ticked.has("studio") && match.studio) patch.studio = match.studio.name;
      if (Object.keys(patch).length > 0) await updateItem(item.id, patch);

      const performers = newPerformers.filter((p) => ticked.has(`p:${p.name}`));
      if (performers.length > 0) {
        await savePerformers(item.id, [
          ...item.performers.map((p) => p.name),
          ...performers.map((p) => p.name),
        ]);
      }
      const tags = newTags.filter((t) => ticked.has(`t:${t.name}`));
      if (tags.length > 0) {
        await saveTags(item.id, [...item.tags.map((t) => t.name), ...tags.map((t) => t.name)]);
      }
    },
    onSuccess: () => {
      invalidateItemEverywhere(queryClient, item.id);
      // Names that did not exist before now do.
      void queryClient.invalidateQueries({ queryKey: qk.performers.all });
      void queryClient.invalidateQueries({ queryKey: qk.performer.all });
      void queryClient.invalidateQueries({ queryKey: qk.tags });
      void queryClient.invalidateQueries({ queryKey: qk.studios.all });
      onDone();
    },
  });

  const nothing = !showTitle && !showDetails && !showDate && !showStudio && !newPerformers.length && !newTags.length;

  function row(key: string, label: string, body: React.ReactNode) {
    return (
      <li key={key}>
        <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50">
          <input
            type="checkbox"
            checked={ticked.has(key)}
            onChange={() => toggle(key)}
            className="mt-1"
          />
          <span className="min-w-0 flex-1 text-sm">
            <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
              {label}
            </span>
            {body}
          </span>
        </label>
      </li>
    );
  }

  const named = (key: string, label: string, entry: StashDbName) =>
    row(
      key,
      label,
      <>
        {entry.name}
        {!entry.inLibrary && (
          <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
            new
          </span>
        )}
      </>,
    );

  // A performer the video already has: shown so the list matches StashDB's,
  // but there is nothing to copy.
  const onVideo = (key: string, name: string) => (
    <li key={key}>
      <div className="flex items-start gap-3 rounded-md px-2 py-1.5 opacity-60">
        <input type="checkbox" checked disabled aria-label={`${name} is already on this video`} className="mt-1" />
        <span className="min-w-0 flex-1 text-sm">
          <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">Performer</span>
          {name}
          <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
            already added
          </span>
        </span>
      </div>
    </li>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium">{match.title ?? "Untitled"}</span>
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
        >
          Pick another
        </button>
      </div>

      {!nothing && (
        <button
          type="button"
          onClick={() => setTicked(allTicked ? new Set() : new Set(allKeys))}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {allTicked ? "Clear all" : "Select all"}
        </button>
      )}

      {nothing ? (
        <p className="text-sm text-muted-foreground">
          StashDB has nothing here that this video doesn’t already have.
        </p>
      ) : (
        <ul className="space-y-1">
          {showTitle &&
            row(
              "title",
              "Title",
              <>
                <span className="mr-2 text-muted-foreground line-through">{item.title}</span>
                {match.title}
              </>,
            )}
          {showDetails &&
            row(
              "details",
              "Details",
              <span className="line-clamp-3 text-muted-foreground">{match.details}</span>,
            )}
          {showDate &&
            row(
              "date",
              "Release date",
              <>
                {item.releaseDate && (
                  <span className="mr-2 text-muted-foreground line-through">{item.releaseDate.slice(0, 10)}</span>
                )}
                {matchDate}
              </>,
            )}
          {showStudio && match.studio && named("studio", "Studio", match.studio)}
          {match.performers.map((p) =>
            has(item.performers.map((x) => x.name), p.name)
              ? onVideo(`pa:${p.name}`, p.name)
              : named(`p:${p.name}`, "Performer", p),
          )}
          {newTags.map((t) => named(`t:${t.name}`, "Tag", t))}
        </ul>
      )}

      {apply.error && <p className="text-xs text-destructive">{apply.error.message}</p>}

      <SaveButton onClick={() => apply.mutate()} disabled={apply.isPending || ticked.size === 0} />
    </div>
  );
}
