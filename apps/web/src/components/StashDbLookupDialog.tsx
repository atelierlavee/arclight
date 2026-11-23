// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { EditDialog, SaveButton } from "./EditDialog";
import { EDIT_INPUT } from "@/lib/editForm";
import {
  PERFORMER_GENDERS,
  savePerformerFacts,
  type PerformerDetail,
  type PerformerFacts,
} from "@/lib/performerApi";
import { searchStashDbPerformers, type StashDbPerformer } from "@/lib/stashdbApi";
import { invalidatePerformer } from "@/lib/invalidate";
import { qk } from "@/lib/queryKeys";

type FactKey = keyof PerformerFacts;

const LABELS: Record<FactKey, string> = {
  gender: "Gender",
  birthdate: "Birthdate",
  country: "Country",
  ethnicity: "Ethnicity",
  heightCm: "Height (cm)",
  measurements: "Measurements",
  hairColor: "Hair",
  eyeColor: "Eyes",
  careerStart: "Career from",
  careerEnd: "Career to",
  tattoos: "Tattoos",
  piercings: "Piercings",
};

const KEYS = Object.keys(LABELS) as FactKey[];

function show(key: FactKey, value: PerformerFacts[FactKey]): string {
  if (value === null) return "—";
  return key === "gender" ? PERFORMER_GENDERS[value as keyof typeof PERFORMER_GENDERS] : String(value);
}

/** One line to tell apart the several people StashDB may have under a name. */
function summary(match: StashDbPerformer): string {
  return [
    match.gender ? PERFORMER_GENDERS[match.gender] : null,
    match.country,
    match.birthdate ? `born ${match.birthdate}` : null,
    match.careerStart ? `active ${match.careerStart}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Look a performer up on StashDB and copy chosen details onto their profile.
 *
 * Two steps: pick the right match (a name often has several), then tick the
 * facts to copy. Facts you already have are shown beside the new value and
 * left unticked, so a lookup fills gaps by default and only overwrites when
 * you say so. Nothing is written until you apply.
 */
export function StashDbLookupDialog({
  performer,
  onClose,
}: {
  performer: PerformerDetail;
  onClose: () => void;
}) {
  const [term, setTerm] = useState(performer.name);
  const [searched, setSearched] = useState(performer.name);
  const [match, setMatch] = useState<StashDbPerformer | null>(null);

  const results = useQuery({
    queryKey: qk.stashDbPerformers(searched),
    queryFn: () => searchStashDbPerformers(searched),
    // A lookup is a request to someone else's server, so it is made once per
    // search and not refreshed in the background.
    staleTime: Infinity,
    retry: false,
  });

  return (
    <EditDialog
      title={
        <>
          StashDB lookup for <span className="sensitive">{performer.name}</span>
        </>
      }
      onClose={onClose}
    >
      {match ? (
        <ApplyStep
          performer={performer}
          match={match}
          onBack={() => setMatch(null)}
          onDone={onClose}
        />
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
              aria-label="Name to look up"
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
            <p className="text-sm text-muted-foreground">No one on StashDB by that name.</p>
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
                      {candidate.name}
                      {candidate.disambiguation && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {candidate.disambiguation}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {summary(candidate) || "No details"}
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
  performer,
  match,
  onBack,
  onDone,
}: {
  performer: PerformerDetail;
  match: StashDbPerformer;
  onBack: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  // Only facts StashDB has and that differ from what is already here.
  const rows = KEYS.filter((key) => match[key] !== null && match[key] !== performer[key]);
  // Gaps are ticked, differences are not: copying over what someone typed in
  // by hand is a decision, not a default.
  const [ticked, setTicked] = useState(
    () => new Set(rows.filter((key) => performer[key] === null)),
  );

  const apply = useMutation({
    mutationFn: () => {
      const patch: Record<string, unknown> = {};
      for (const key of ticked) patch[key] = match[key];
      return savePerformerFacts(performer.id, patch as Partial<PerformerFacts>);
    },
    onSuccess: () => {
      invalidatePerformer(queryClient, performer.id);
      onDone();
    },
  });

  function toggle(key: FactKey) {
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium">
          {match.name}
          {match.disambiguation && (
            <span className="font-normal text-muted-foreground"> · {match.disambiguation}</span>
          )}
        </span>
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
        >
          Pick another
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          StashDB has nothing here that this profile doesn’t already have.
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((key) => (
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
                    {LABELS[key]}
                  </span>
                  {performer[key] !== null && (
                    <span className="mr-2 text-muted-foreground line-through">
                      {show(key, performer[key])}
                    </span>
                  )}
                  {show(key, match[key])}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {apply.error && <p className="text-xs text-destructive">{apply.error.message}</p>}

      <SaveButton onClick={() => apply.mutate()} disabled={apply.isPending || ticked.size === 0} />
    </div>
  );
}
