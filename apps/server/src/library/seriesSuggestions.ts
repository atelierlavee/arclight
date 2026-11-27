// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

/**
 * Spotting likely series among videos not yet in one: titles from the same
 * studio that differ only by a part marker — "LANA Part 1", "Lana part 4" —
 * are probably parts of one saga. Suggested, never applied: the owner
 * creates the series.
 */

/** "Part 3", "Pt. 3", "Vol 2", "Volume 2", "Chapter 4", "Ch. 4", "Episode 5", "Ep 5", "#2". */
const PART_MARKER = /^(.*?)[\s._:,-]*\b(?:part|pt\.?|vol(?:ume)?\.?|chapter|ch\.?|episode|ep\.?)\s*(\d{1,3})\b(.*)$|^(.*?)\s*#\s*(\d{1,3})\b(.*)$/i;

export type SuggestionCandidate = { id: number; title: string; studio: string | null };

export type SeriesSuggestion = {
  /** A stable id for the group, so a dismissed suggestion stays dismissed. */
  key: string;
  /** The title with the part marker taken out: the series' likely name. */
  name: string;
  studio: string | null;
  /** In part order. */
  items: { id: number; title: string; part: number }[];
};

/** Lowercase letters and digits only, so "LANA" and "Lana" group together. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** The title split into what names the series and its part number, or null. */
export function splitPart(title: string): { name: string; part: number } | null {
  const match = PART_MARKER.exec(title.trim());
  if (!match) return null;
  const before = (match[1] ?? match[4] ?? "").trim();
  const number = Number(match[2] ?? match[5]);
  const after = (match[3] ?? match[6] ?? "").replace(/^[\s._:,-]+/, "").trim();
  const name = [before, after].filter(Boolean).join(" ").replace(/[\s._:,-]+$/, "").trim();
  if (!name || !Number.isFinite(number)) return null;
  return { name, part: number };
}

export function suggestSeries(candidates: SuggestionCandidate[]): SeriesSuggestion[] {
  const groups = new Map<string, { names: string[]; studio: string | null; items: SeriesSuggestion["items"] }>();
  for (const candidate of candidates) {
    const split = splitPart(candidate.title);
    if (!split) continue;
    const key = `${normalise(candidate.studio ?? "")}|${normalise(split.name)}`;
    const group = groups.get(key) ?? { names: [], studio: candidate.studio, items: [] };
    group.names.push(split.name);
    group.items.push({ id: candidate.id, title: candidate.title, part: split.part });
    groups.set(key, group);
  }

  const suggestions: SeriesSuggestion[] = [];
  for (const [key, group] of groups) {
    // Two parts at least, and not one part twice over.
    const parts = new Set(group.items.map((item) => item.part));
    if (group.items.length < 2 || parts.size < 2) continue;
    // The most common spelling of the name, preferring one not all capitals.
    const counts = new Map<string, number>();
    for (const name of group.names) counts.set(name, (counts.get(name) ?? 0) + 1);
    const name = [...counts.entries()].sort(
      (a, b) =>
        Number(a[0] === a[0].toUpperCase()) - Number(b[0] === b[0].toUpperCase()) || b[1] - a[1],
    )[0][0];
    suggestions.push({
      key,
      name,
      studio: group.studio,
      items: group.items.sort((a, b) => a.part - b.part || a.id - b.id),
    });
  }
  return suggestions.sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
}
