// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

/**
 * How many tiles a home-page row shows before "See all".
 *
 * The home page is a place to start from, not to browse in — a row that runs
 * to a hundred tiles is a worse version of the page it links to. Kept here
 * rather than at each call site so the rows stay in step with each other.
 */
export const ROW_TILE_LIMIT = 10;

/**
 * Performers get a couple more, because their tiles are portraits at roughly
 * half the width of a video still — the same count leaves their row looking
 * emptier than the ones around it.
 */
export const PERFORMER_ROW_TILE_LIMIT = 12;
