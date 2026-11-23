// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

/**
 * How a view mode and a density turn into actual lengths.
 *
 * Four axes on purpose, kept orthogonal so no two controls fight over the
 * same pixel: tile size is the base width you choose, the view mode decides
 * how much of that width a card wants, the tile shape decides how the artwork
 * is cropped, and density decides how much air sits between cards. Bundling
 * them into one "size" control was the alternative, and it makes every preset
 * a compromise.
 */

/**
 * Three modes, and they differ only by how much width a card asks for.
 *
 * Cinematic and List existed here and were removed. Both broke that
 * invariant — one cropped the artwork to a wider frame, the other was not a
 * tile at all — and neither earned the exception: three sizes of the same
 * card is a size control, which is what people actually reach for, while a
 * fourth and fifth entry made the picker a decision rather than a slider.
 */
export type ViewMode = "grid" | "compact" | "large";

export const VIEW_MODES: { value: ViewMode; label: string; hint: string }[] = [
  { value: "grid", label: "Grid", hint: "The standard tile." },
  { value: "compact", label: "Compact", hint: "Smaller tiles, more per row." },
  { value: "large", label: "Large", hint: "Bigger tiles, same detail." },
];

/**
 * The shape of a media tile's artwork frame.
 *
 * A fourth axis, and orthogonal to the other three for the same reason they
 * are orthogonal to each other: size is how big a card is, the view mode is
 * how much width it asks for, density is the air around it, and this is the
 * crop. Folding shape into the view mode was the alternative — a "Portrait"
 * entry beside Grid and Compact — and it would have made every mode a
 * decision about two things at once, so choosing portrait would have meant
 * giving up the size you had chosen.
 *
 * Only two entries on purpose. The picker above this one is a size control
 * with three stops; this one is a choice between the two shapes artwork
 * actually comes in, and a third would make it a decision rather than a flip.
 */
export type TileShape = "landscape" | "portrait";

export const TILE_SHAPES: { value: TileShape; label: string; hint: string }[] = [
  {
    value: "landscape",
    label: "Landscape",
    hint: "Wide frames, the shape a video still already is.",
  },
  {
    value: "portrait",
    label: "Portrait",
    hint: "Tall frames, the shape cover art already is.",
  },
];

export type Density = "spacious" | "comfortable" | "compact" | "dense";

export const DENSITIES: { value: Density; label: string }[] = [
  { value: "spacious", label: "Spacious" },
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
  { value: "dense", label: "Dense" },
];

/** What a tile writes over its artwork. Mirrors the existing setting. */
export type TileInfo = "full" | "title" | "none" | "below";

/**
 * Multiplies the chosen tile width. The mode says how big a card wants to be
 * relative to your baseline, rather than replacing the baseline — so moving
 * the size slider still does what it says in every mode.
 *
 * Spread wide on purpose. The grid fits columns with `auto-fill` and then
 * stretches them with `1fr`, so a multiplier only shows up when it changes
 * the column *count* — two modes a few percent apart land on the same count
 * at most widths and render identically. Two modes a few percent apart were
 * indistinguishable at every ordinary viewport.
 */
const MODE_WIDTH_SCALE: Record<ViewMode, number> = {
  grid: 1,
  compact: 0.8,
  large: 1.2,
};

/**
 * Density's own contribution to width.
 *
 * The spec asks density to affect column count, and gaps alone barely do:
 * shrinking a 16px gap to 6px rarely buys a whole extra column. This is what
 * makes a density change visible rather than theoretical.
 */
const DENSITY_WIDTH_SCALE: Record<Density, number> = {
  spacious: 1.12,
  comfortable: 1,
  compact: 0.92,
  dense: 0.85,
};

/**
 * The shape of a card's frame, per tile shape.
 *
 * Still a table keyed by shape rather than by mode: the modes differ by how
 * much room a card takes, not by how the artwork is cropped. A wide 21:9
 * mode used to live here and was dropped — it cut the sides off cover art,
 * which is the one thing a library of artwork should not do to itself.
 *
 * 5:7 for portrait, arrived at from both directions. It began at 2:3, which
 * was too tall — against a 16:10 neighbour a 2:3 tile is two and a half times
 * its height, so one portrait tile set the height of its whole row. 3:4 fixed
 * that and read as slightly squat. 5:7 sits between them: about 5% taller than
 * 3:4, still well short of 2:3, and a standard photographic ratio rather than
 * a number picked to split the difference.
 *
 * Only the height moves. The width of a tile is the grid column's, which this
 * ratio does not touch, so a taller portrait tile is taller and not wider.
 *
 * The performer cards stay 2:3 and are not affected: they are a fixed shape
 * on their own pages, not a tile sitting next to a landscape one.
 *
 * Landscape keeps 16:10 exactly, so an install that never touches this setting
 * is drawn the same as it was before the setting existed.
 *
 * Kept as width and height rather than a CSS string so the virtualized grid
 * can estimate a row's height from it, instead of parsing the string back out
 * and producing NaN the first time the format changes.
 */
export const SHAPE_ASPECT: Record<TileShape, { w: number; h: number }> = {
  landscape: { w: 16, h: 10 },
  portrait: { w: 5, h: 7.5 },
};

/**
 * The shape's own contribution to width, like the mode's and the density's.
 *
 * Without this, portrait is not a shape change but a size change: the column
 * width is the same number, so a 416px tile that was 260px tall becomes 624px
 * tall, three of them fill a laptop screen, and the size slider you set for
 * landscape means something entirely different in portrait.
 *
 * 0.67 is the factor that keeps the *area* of a card about the same across
 * the two shapes — √(0.625 / 1.4) to two places. Matching the height instead
 * would mean 0.45, which is arithmetically tidy and produces tiles too narrow
 * to read a title in. Area is what the eye actually judges "same size" by.
 *
 * Derived from the ratio above rather than picked, so changing the portrait
 * shape and forgetting this cannot leave the two disagreeing.
 */
const SHAPE_WIDTH_SCALE: Record<TileShape, number> = {
  landscape: 1,
  portrait: 0.67,
};

/**
 * Gaps in pixels, per density: [between columns, under a row].
 *
 * Rows get more than columns at every level because a row's gap also has to
 * clear the text under the card, which a column gap never does.
 */
const DENSITY_GAPS: Record<Density, { column: number; row: number }> = {
  spacious: { column: 28, row: 40 },
  comfortable: { column: 16, row: 24 },
  compact: { column: 10, row: 16 },
  dense: { column: 6, row: 10 },
};

/** Padding and text spacing inside a card, in pixels. */
const DENSITY_PADDING: Record<Density, number> = {
  spacious: 14,
  comfortable: 10,
  compact: 7,
  dense: 4,
};

/**
 * The parts of a card's look that do not depend on how wide the grid made it.
 *
 * Split out because a card is rendered in rows and pickers too, where nothing
 * has computed a column width. Since the wide mode was dropped these no
 * longer vary by view mode at all — the mode only decides how much width a
 * card asks for, which is the grid's business, not the card's.
 */
export type CardChrome = {
  /** A CSS `aspect-ratio` value for the artwork frame. */
  aspectRatio: string;
  /** The same shape as a multiplier, for working out a row's height. */
  heightRatio: number;
  paddingPx: number;
  tileInfo: TileInfo;
};

/**
 * The parts of a card's look that do not depend on how wide the grid made it.
 *
 * Still no view mode here, and that is the point of having only three: they
 * differ by how much width a card asks for, which is the grid's business, not
 * the card's. The two modes that needed this to know about them — one
 * cropping to a wider frame, one laying out as a row — have been removed.
 *
 * The shape does belong here, because the crop is the card's own business and
 * is the same in a row, a grid and a picker.
 *
 * `shape` defaults rather than being required: this is read from half a dozen
 * call sites, and a default means one that is missed keeps drawing the shape
 * the app has always drawn instead of `undefined / undefined`.
 */
export function cardChrome(
  density: Density,
  tileInfo: TileInfo,
  shape: TileShape = "landscape",
): CardChrome {
  // `??` rather than trusting the key: this arrives from stored settings, and
  // a hand-edited value would otherwise reach CSS as "undefined / undefined"
  // and collapse every frame in the app to nothing.
  const aspect = SHAPE_ASPECT[shape] ?? SHAPE_ASPECT.landscape;
  return {
    aspectRatio: `${aspect.w} / ${aspect.h}`,
    heightRatio: aspect.h / aspect.w,
    paddingPx: DENSITY_PADDING[density] ?? DENSITY_PADDING.comfortable,
    // No mode overrides the label setting, so it passes straight through.
    tileInfo,
  };
}

/**
 * How much taller a portrait tile may stand than the landscape tiles beside it.
 *
 * A tile's width is its grid column's, and the column is sized for whatever
 * the Appearance setting says. So a portrait tile dropped into a landscape
 * grid keeps the full column width and gets its *height* from the ratio —
 * 1.5 against 0.625, which is two and a half times the height of everything
 * around it. It read as a different page element rather than as a tile.
 *
 * Expressed as a height multiple rather than a width percentage because that
 * is the thing being judged: "a bit taller than its neighbours" survives a
 * change to either ratio, where a hardcoded 52% quietly stops meaning that
 * the moment the portrait shape is tuned.
 */
export const PORTRAIT_HEIGHT_FACTOR = 2;

/**
 * The fraction of its column a tile should occupy, given the shape the column
 * was sized for.
 *
 * 1 whenever the two agree — the column already is that shape, and narrowing
 * it would leave a gap for no reason. Below 1 only for the odd tile out, and
 * only downward: a tile never overflows its column.
 */
export function tileWidthFraction(shape: TileShape, columnShape: TileShape): number {
  if (shape === columnShape) return 1;

  const own = SHAPE_ASPECT[shape] ?? SHAPE_ASPECT.landscape;
  const column = SHAPE_ASPECT[columnShape] ?? SHAPE_ASPECT.landscape;
  const ownRatio = own.h / own.w;
  const columnRatio = column.h / column.w;

  // Only a taller-than-the-column tile needs reining in. A shorter one
  // already takes less room than its neighbours.
  if (ownRatio <= columnRatio) return 1;

  return Math.min(1, (columnRatio * PORTRAIT_HEIGHT_FACTOR) / ownRatio);
}

/**
 * Widest *minimum* column the media grid may ask for on a phone.
 *
 * This is the `minmax()` floor, not the width a tile ends up: the columns
 * still stretch to fill the row, so 150 buys two columns of about 171px at a
 * 390px viewport rather than tiles of 150px. Without it a desktop tile size
 * is wider than the whole screen and the grid falls to one card per row.
 *
 * Deliberately not applied to the rows. They size each tile directly instead
 * of stretching it, so the cap there really did mean 150px tiles — small
 * enough that the caption covered the artwork it was captioning.
 */
export const MOBILE_MAX_TILE_PX = 150;

export type CardLayout = CardChrome & {
  /** Minimum column width the grid should fit against. */
  widthPx: number;
  columnGapPx: number;
  rowGapPx: number;
};

export function cardLayout(
  tileWidthPx: number,
  mode: ViewMode,
  density: Density,
  tileInfo: TileInfo,
  shape: TileShape = "landscape",
): CardLayout {
  const gaps = DENSITY_GAPS[density] ?? DENSITY_GAPS.comfortable;
  return {
    ...cardChrome(density, tileInfo, shape),
    // Rounded because it becomes a CSS pixel length and a grid column count;
    // a fractional minimum makes the column maths drift by a column at some
    // widths and not others.
    widthPx: Math.max(
      1,
      Math.round(
        tileWidthPx *
          (MODE_WIDTH_SCALE[mode] ?? 1) *
          (DENSITY_WIDTH_SCALE[density] ?? 1) *
          (SHAPE_WIDTH_SCALE[shape] ?? 1),
      ),
    ),
    columnGapPx: gaps.column,
    rowGapPx: gaps.row,
  };
}

/**
 * The named bundles. "Custom" is not listed: it is what the panel reports
 * when the current settings match none of these, rather than something you
 * can pick.
 */
export type PresetName = "minimal" | "comfortable" | "detailed";

export type PresetSettings = {
  viewMode: ViewMode;
  density: Density;
  tileInfo: TileInfo;
  /**
   * The size slider's position.
   *
   * Presets set it because they change how big cards actually are, and a
   * slider that stayed put while the tiles visibly resized was telling you
   * something untrue about your own settings. It also carries most of the
   * difference between presets — the mode multipliers are deliberately mild,
   * so the number you can see is the one doing the work.
   */
  tileSizePercent: number;
};

export const PRESETS: {
  value: PresetName;
  label: string;
  hint: string;
  settings: PresetSettings;
}[] = [
  {
    value: "minimal",
    label: "Minimal",
    hint: "Large imagery, no text over it.",
    settings: {
      viewMode: "large",
      density: "spacious",
      tileInfo: "none",
      tileSizePercent: 74,
    },
  },
  {
    value: "comfortable",
    label: "Comfortable",
    hint: "Balanced spacing and detail.",
    settings: {
      viewMode: "grid",
      density: "comfortable",
      tileInfo: "full",
      tileSizePercent: 58,
    },
  },
  {
    value: "detailed",
    label: "Detailed",
    hint: "More on screen, everything labelled.",
    settings: {
      viewMode: "compact",
      density: "dense",
      tileInfo: "full",
      tileSizePercent: 42,
    },
  },
];

/**
 * Which preset the current settings are, or null for "Custom".
 *
 * Derived rather than stored: a stored preset name goes stale the moment a
 * single setting is changed behind it, and then the panel claims a preset the
 * view no longer matches.
 */
export function activePreset(settings: PresetSettings): PresetName | null {
  const match = PRESETS.find(
    (preset) =>
      preset.settings.viewMode === settings.viewMode &&
      preset.settings.density === settings.density &&
      preset.settings.tileInfo === settings.tileInfo &&
      preset.settings.tileSizePercent === settings.tileSizePercent,
  );
  return match?.value ?? null;
}
