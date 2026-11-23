// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

/**
 * How many columns fit in `width`.
 *
 * Mirrors `repeat(auto-fill, minmax(minTileWidth, 1fr))` — the CSS the media
 * grid used before it was virtualized. A virtualized grid has to know its own
 * column count to slice items into rows, so this has to agree with what the
 * browser would have done on its own, or rows and tiles disagree about how
 * many cards there are per line.
 */
export function columnsForWidth(
  width: number,
  minTileWidth: number,
  gap: number,
): number {
  // Guards the unmeasured first pass (width 0) and a nonsense tile width,
  // either of which would otherwise divide by zero or floor to nothing.
  if (width <= 0 || minTileWidth <= 0) return 1;
  // n columns need n tiles and n-1 gaps, so adding one gap to each side of
  // the division lets it count whole tile+gap units.
  return Math.max(1, Math.floor((width + gap) / (minTileWidth + gap)));
}

/** The width one column actually gets once the gaps are taken out. */
export function columnWidthFor(
  width: number,
  columns: number,
  gap: number,
): number {
  if (columns <= 0) return Math.max(0, width);
  return Math.max(0, (width - (columns - 1) * gap) / columns);
}

/**
 * Splits a flat list into rows of `columns`.
 *
 * The column count comes from a live measurement, so it is guarded here
 * rather than trusted: a zero would make the caller's loop never advance.
 */
export function chunkIntoRows<T>(items: T[], columns: number): T[][] {
  const perRow = Math.max(1, Math.floor(columns));
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += perRow) {
    rows.push(items.slice(i, i + perRow));
  }
  return rows;
}
