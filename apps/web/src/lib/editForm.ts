/** Text input styling shared by the edit forms. */
export const EDIT_INPUT =
  "w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-ring/60";

/** Splits a comma-separated alias field into names. */
export function splitAliases(value: string): string[] {
  return value
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean);
}
