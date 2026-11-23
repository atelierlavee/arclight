// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

/** A slice of a part-to-whole chart. */
export type DonutSlice = {
  name: string;
  value: number;
  detail?: string;
  /** Whatever the caller needs to link the row — a studio id, say. */
  id?: number | null;
};

/** The named slices a donut draws before folding the rest; one per categorical slot. */
export const MAX_SLICES = 5;

/**
 * Categorical slots for the slices, in fixed order — the first slice always
 * takes the first colour, so a studio keeps its colour as long as it keeps
 * its rank. Stepped for this app's dark surface and checked for colour-blind
 * separation between neighbours (the dataviz palette validator, dark mode).
 *
 * Five and no more: past that a ring of slivers stops being readable, so a
 * caller folds the tail into one neutral "everything else" slice instead of
 * inventing a sixth hue.
 */
export const CHART_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];
/** The folded tail. Neutral on purpose: it is not one thing, so it gets no hue. */
export const REST_COLOR = "#6f6f6f";


/**
 * Keeps the biggest slices and folds the rest into one.
 *
 * At most MAX_SLICES named slices, so none of them has to reuse a colour —
 * a sixth hued slice would repeat the first, and on a ring it sits right
 * next to it. A tail that arrives already folded (the server sends its own
 * "Everything else") is merged in rather than drawn as a second one.
 */
export function foldSlices(slices: DonutSlice[], restName = "Everything else"): DonutSlice[] {
  const incomingRest = slices
    .filter((slice) => slice.name === restName)
    .reduce((sum, slice) => sum + slice.value, 0);
  const named = slices
    .filter((slice) => slice.name !== restName && slice.value > 0)
    .sort((a, b) => b.value - a.value);

  const kept = named.slice(0, MAX_SLICES);
  const rest = incomingRest + named.slice(MAX_SLICES).reduce((sum, slice) => sum + slice.value, 0);
  return rest > 0 ? [...kept, { name: restName, value: rest }] : kept;
}
