// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The migration level of the code currently running.
 *
 * Read from drizzle's own journal rather than tracked by hand, so it cannot
 * drift: `npm run db:generate` appends an entry, and this reports it. The
 * journal ships alongside the SQL in both modes — `npm run build` copies
 * `src/db/migrations` wholesale into `dist/db/migrations` — so resolving it
 * relative to this file works from src under tsx and from dist under node.
 */
export type JournalEntry = { idx: number; when: number; tag: string };

const JOURNAL_PATH = path.resolve(
  import.meta.dirname,
  "migrations",
  "meta",
  "_journal.json"
);

export async function latestMigration(): Promise<JournalEntry | null> {
  const raw = await readFile(JOURNAL_PATH, "utf8");
  const parsed = JSON.parse(raw) as { entries?: JournalEntry[] };
  const entries = parsed.entries ?? [];
  if (entries.length === 0) return null;
  // Ordered by `when` rather than trusting array position: the comparison a
  // restore makes is against this number, and an out-of-order journal would
  // quietly understate how far the code has come.
  return entries.reduce((latest, entry) =>
    entry.when > latest.when ? entry : latest
  );
}
