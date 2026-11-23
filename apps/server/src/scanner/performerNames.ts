// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import path from "node:path";

// Directory prefixes that are filesystem bookkeeping rather than content.
// Without this, a file inside .Trash-1000/ or @eaDir/ would create a
// performer named after the junk directory.
const IGNORED_SEGMENT_PREFIXES = [".", "@", "#"];

// Shorter keys match far too much — "Al" appears inside a great many words.
const MIN_MATCH_KEY_LENGTH = 3;

/**
 * Collapses a raw name to its canonical form.
 *
 * NFC normalisation is load-bearing on macOS: readdir returns decomposed
 * filenames, so a folder named "José" arrives as "José" while the
 * browser sends the composed form. `lower()` does not equate the two, and
 * you would end up with two performers whose names render identically.
 */
export function normalizeName(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * The performer implied by a file's location: the first path segment below
 * the library root, when the file is nested at all.
 *
 * Returns null for a file sitting directly at the root — those are handled
 * separately by the filename fallback, which needs the full performer set to
 * exist first and so can't run per-file.
 */
export function performerNameFromPath(rootPath: string, filePath: string): string | null {
  const relative = path.relative(rootPath, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;

  const segments = relative.split(/[\\/]/);
  if (segments.length < 2) return null;

  const top = normalizeName(segments[0]);
  if (!top) return null;
  if (IGNORED_SEGMENT_PREFIXES.some((prefix) => top.startsWith(prefix))) return null;
  // A bare year directory is a date, not a person. This is a plain rejection
  // rather than an attempt to parse meaning out of the name.
  if (/^\d{4}$/.test(top)) return null;

  return top;
}

/** What a filename following the declared convention says about its video. */
export type DeclaredName = {
  studio: string | null;
  performerNames: string[];
  releaseDate: string | null;
  title: string;
};

/**
 * A release date written in a filename, as an ISO `YYYY-MM-DD` string.
 *
 * Two layouts, told apart by which end carries the four-digit year rather
 * than by guessing a locale:
 *
 *   MM.DD.YYYY  the declared convention  — "02.15.2020"
 *   YYYY.MM.DD  what most existing names already use — "2018.09.06"
 *
 * `01.02.2020` is genuinely ambiguous between the two. The convention says
 * MM.DD.YYYY, so it resolves that way; there is no clever tiebreak, just a
 * stated rule.
 *
 * Out-of-range parts are rejected rather than clamped — "13.45.2020" yields
 * no date at all, which is honest, instead of some nearby wrong one.
 */
export function parseDateToken(token: string): string | null {
  const match = /^(\d{2,4})[.\-_](\d{1,2})[.\-_](\d{2,4})$/.exec(token.trim());
  if (!match) return null;

  const [, first, middle, last] = match;

  let year: number;
  let month: number;
  let day: number;
  if (first.length === 4) {
    year = Number(first);
    month = Number(middle);
    day = Number(last);
  } else if (last.length === 4) {
    year = Number(last);
    month = Number(first);
    day = Number(middle);
  } else {
    // A two-digit year is a coin flip between 1920 and 2020 — skip it rather
    // than invent a century.
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;

  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // Catches a day that doesn't exist in that month — 02.31.2020 round-trips
  // to March 2nd, which would be a silently wrong date.
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.getUTCDate() !== day) return null;

  return iso;
}

/**
 * A release date found anywhere in a filename that doesn't follow the
 * declared convention, so the names not yet renamed still get one.
 */
export function releaseDateFromFilename(filePath: string): string | null {
  const base = (filePath.split("/").pop() ?? filePath).replace(/\.[^./]+$/, "");
  for (const candidate of base.match(/\d{2,4}[.\-_]\d{1,2}[.\-_]\d{2,4}/g) ?? []) {
    const date = parseDateToken(candidate);
    if (date) return date;
  }
  return null;
}

/**
 * Parses the declared naming convention:
 *
 *     [Studio] Performer 1, Performer 2 - MM.DD.YYYY - Video title.ext
 *
 * A **leading** `[` is the opt-in signal, which is what makes this safe to add
 * to an existing library: a filename that doesn't start with one is left
 * entirely to the folder-derived path, so nothing already on disk changes
 * meaning. (Verified against the library at the time of writing: none of its
 * 37 filenames began with a bracket.)
 *
 * Because the brackets and commas are typed deliberately, the names inside are
 * a statement rather than a guess — so they're taken literally and created on
 * sight. That's the whole reason for a convention: the alternative, sniffing
 * co-performers out of arbitrary filenames, needs Title-Case heuristics that
 * eventually invent a performer out of some stray phrase.
 *
 * Returns null when the convention doesn't apply, never a partial result — a
 * half-applied parse would be harder to predict than no parse at all.
 */
export function parseDeclaredName(filePath: string): DeclaredName | null {
  const base = (filePath.split("/").pop() ?? filePath).replace(/\.[^./]+$/, "");
  if (!base.startsWith("[")) return null;

  const close = base.indexOf("]");
  if (close === -1) return null;

  const studio = normalizeName(base.slice(1, close));
  const rest = base.slice(close + 1);

  // The cast ends at the FIRST " - "; titles legitimately contain dashes
  // ("Girls - Girls - Girls"), so nothing after that point is split blindly.
  const separator = rest.indexOf(" - ");
  const namePart = separator === -1 ? rest : rest.slice(0, separator);
  let titlePart = separator === -1 ? rest : rest.slice(separator + 3);

  // The date segment is optional, and is only consumed when it actually
  // parses as a date. A title that merely starts with a number keeps it —
  // taking the segment on position alone would eat the first words of every
  // filename that has no date in it.
  let releaseDate: string | null = null;
  const afterNames = titlePart.indexOf(" - ");
  if (afterNames !== -1) {
    const candidate = parseDateToken(titlePart.slice(0, afterNames));
    if (candidate) {
      releaseDate = candidate;
      titlePart = titlePart.slice(afterNames + 3);
    }
  }

  const performerNames = namePart
    .split(",")
    .map(normalizeName)
    .filter((name) => name.length >= 2)
    // A bare resolution or year in the performer slot is a naming slip, not a
    // person. Cheap to ignore, and it keeps one typo from creating "1080p".
    .filter((name) => !/^\d{3,4}p?$/i.test(name));

  return {
    // `[]` is a legitimate way to say "no studio" while still opting in.
    studio: studio && !/^\d{3,4}p?$/i.test(studio) ? studio : null,
    performerNames,
    releaseDate,
    title: normalizeName(titlePart) || normalizeName(namePart),
  };
}

/**
 * Flattens a string for loose comparison: separators become spaces and
 * diacritics are stripped, so "Dani.Daniels-2019_HD" becomes
 * "dani daniels 2019 hd" and a filename spelling "Renee" still matches a
 * performer recorded as "Renée".
 */
export function matchKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[._\-+()[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isUsableMatchKey(key: string): boolean {
  return key.length >= MIN_MATCH_KEY_LENGTH;
}

/**
 * Whether `needle` appears in `haystack` as a whole word. Substring matching
 * alone would let a performer named "Ana" claim every file about "Anastasia".
 */
export function hasWordBoundaryMatch(haystack: string, needle: string): boolean {
  // Names legitimately contain regex metacharacters — "Anna (UK)", "A+".
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack);
}

/**
 * The studio implied by a file's location: the second path segment, when a
 * file is nested one level deeper than the performer folder.
 *
 *     <root>/<Performer>/<Studio>/file.mp4
 *
 * Same guards as the performer equivalent, and for the same reasons: a
 * bookkeeping directory or a bare year is a fact about the filing, not a
 * studio. Returns null at any other depth, so a file sitting directly in a
 * performer folder is unaffected.
 */
export function studioNameFromPath(rootPath: string, filePath: string): string | null {
  const relative = path.relative(rootPath, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;

  const segments = relative.split(/[\\/]/);
  // 3 segments is <Performer>/<Studio>/<file> — fewer means no studio folder.
  if (segments.length < 3) return null;

  const studio = normalizeName(segments[1]);
  if (!studio) return null;
  if (IGNORED_SEGMENT_PREFIXES.some((prefix) => studio.startsWith(prefix))) return null;
  if (/^\d{4}$/.test(studio)) return null;

  return studio;
}

/**
 * The studio named in a filename's first `[Brackets]` group, if any.
 *
 * This is delimiter extraction, not filename parsing: the brackets are an
 * explicit marker, so there's no guessing at where a name starts or ends.
 * A file without brackets simply has no studio, rather than something being
 * inferred from the surrounding words.
 */
export function studioNameFromFilename(filePath: string): string | null {
  const base = filePath.split("/").pop() ?? filePath;
  const match = /\[([^\]]+)\]/.exec(base.replace(/\.[^./]+$/, ""));
  if (!match) return null;

  const name = normalizeName(match[1]);
  // A bracketed resolution or year is a fact about the file, not a studio.
  if (!name || /^\d{3,4}p?$/i.test(name)) return null;
  return name;
}
