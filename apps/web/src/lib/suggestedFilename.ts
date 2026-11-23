// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

/**
 * The filename the scanner reads in full:
 *
 *     [Studio] Performer 1, Performer 2 - MM.DD.YYYY - Video title.ext
 *
 * (See "Naming" in the README and parseDeclaredName on the server.) The
 * leading bracket is what opts a file in, so a studio is required; the cast
 * and the date are left out when unknown rather than guessed.
 */

/** Characters no common filesystem allows in a name, and the brackets the format itself uses. */
const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g;

function clean(value: string, { keepDashes = false } = {}): string {
  return value
    .replace(ILLEGAL, " ")
    // " - " is the format's separator. Inside a studio or performer it would
    // end the cast early; a title may keep it, as only the first one counts.
    .replace(keepDashes ? /$^/ : /\s+-\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // Windows drops a trailing dot or space from a name; a leading dot hides it.
    .replace(/^\.+|\.+$/g, "")
    .trim();
}

/** "2026-11-02" -> "11.02.2026"; anything else is not a date worth naming. */
function conventionDate(iso: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${match[2]}.${match[3]}.${match[1]}` : null;
}

function extensionOf(fileName: string | null | undefined): string {
  const match = /\.[A-Za-z0-9]{1,5}$/.exec(fileName ?? "");
  return match ? match[0] : "";
}

export type NameParts = {
  studio: string | null;
  performers: string[];
  /** ISO `YYYY-MM-DD`. */
  date: string | null;
  title: string;
  /** The file as it is now: its extension is kept. */
  currentName: string | null;
};

/** Null when there is not enough to name it by the convention (no studio, or no title). */
export function suggestedFilename(parts: NameParts): string | null {
  const studio = clean((parts.studio ?? "").replace(/[[\]]/g, " "));
  const title = clean(parts.title, { keepDashes: true });
  if (!studio || !title) return null;

  const cast = parts.performers.map((name) => clean(name)).filter(Boolean).join(", ");
  const date = conventionDate(parts.date);

  // With no cast, `[Studio] - Title` is still valid: the first " - " simply
  // ends an empty cast.
  const rest = [date, title].filter(Boolean).join(" - ");
  const head = cast ? `[${studio}] ${cast}` : `[${studio}]`;
  return `${head} - ${rest}${extensionOf(parts.currentName)}`;
}
