// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { isSortValue, type SortValue } from "./filters";

/**
 * The sort you last chose, remembered per surface.
 *
 * Sort was component state, so it reset to "Recently added" every time you
 * navigated away and back — choosing an order only held for as long as you
 * stayed on the page.
 *
 * Per surface rather than one global order, because the surfaces are asking
 * different questions. "Oldest release" is a reasonable way to read one
 * performer's back catalogue and a poor way to open a library you mostly want
 * the newest things from, and a single key would make choosing one silently
 * change the other.
 *
 * Browser storage rather than the server's appearance settings: this is a
 * navigation habit rather than a look, it changes far more often than
 * anything in that panel, and it is genuinely per-device — the order you want
 * on a laptop is not obviously the order you want on a phone.
 */

const STORAGE_KEY = "sort-preference";

export type SortScope = "library" | "performer";

type Stored = Partial<Record<SortScope, SortValue>>;

function read(): Stored {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    if (typeof value !== "object" || value === null) return {};
    return value as Stored;
  } catch {
    // Private mode, blocked storage, or a hand-edited entry. A forgotten
    // preference is survivable; throwing during render is not.
    return {};
  }
}

/**
 * The remembered sort for this surface, or `fallback`.
 *
 * Re-validated on the way out, not just on the way in: the stored value
 * outlives the build that wrote it, so a sort removed in a later release
 * would otherwise come back as a value the server no longer accepts and
 * quietly fall through to the default order, with the control showing
 * something else.
 */
export function readSortPreference(scope: SortScope, fallback: SortValue): SortValue {
  const stored = read()[scope];
  return isSortValue(stored) ? stored : fallback;
}

export function writeSortPreference(scope: SortScope, value: SortValue): void {
  if (!isSortValue(value)) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...read(), [scope]: value }));
  } catch {
    // Same as above: not remembering is a worse experience, not a broken one.
  }
}
