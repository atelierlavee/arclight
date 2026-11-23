// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  activePreset,
  cardChrome,
  cardLayout,
  PRESETS,
  PORTRAIT_HEIGHT_FACTOR,
  SHAPE_ASPECT,
  TILE_SHAPES,
  tileWidthFraction,
  VIEW_MODES,
} from "./layout";
import { columnsForWidth } from "./gridLayout";
import { tileWidthPx } from "./appearance";

describe("cardLayout", () => {
  it("scales the chosen tile width by the mode, leaving the slider meaningful", () => {
    expect(cardLayout(400, "grid", "comfortable", "full").widthPx).toBe(400);
    expect(cardLayout(400, "compact", "comfortable", "full").widthPx).toBe(320);
    expect(cardLayout(400, "large", "comfortable", "full").widthPx).toBe(480);
  });

  it("gives a whole number of pixels, which the column maths needs", () => {
    expect(Number.isInteger(cardLayout(333, "compact", "dense", "full").widthPx)).toBe(true);
  });

  it("never collapses a card to nothing", () => {
    expect(cardLayout(0, "compact", "dense", "none").widthPx).toBeGreaterThan(0);
  });

  it("tightens every gap as density increases", () => {
    const spacious = cardLayout(400, "grid", "spacious", "full");
    const dense = cardLayout(400, "grid", "dense", "full");
    expect(dense.columnGapPx).toBeLessThan(spacious.columnGapPx);
    expect(dense.rowGapPx).toBeLessThan(spacious.rowGapPx);
    expect(dense.paddingPx).toBeLessThan(spacious.paddingPx);
  });

  it("leaves room under a row for the text a column gap never clears", () => {
    for (const density of ["spacious", "comfortable", "compact", "dense"] as const) {
      const layout = cardLayout(400, "grid", density, "full");
      expect(layout.rowGapPx).toBeGreaterThan(layout.columnGapPx);
    }
  });

  // Cover art is 16:10 and stays that way in every mode. Two modes that
  // broke this have existed and been removed: a 21:9 one that cropped the
  // sides off the artwork, and a Cinematic 2:1 that cropped it less but for
  // the same reason. The modes differ by how much width a card asks for,
  // and by nothing else.
  it("keeps every mode on the same frame, so nothing crops the artwork", () => {
    for (const { value } of VIEW_MODES) {
      expect(cardLayout(400, value, "comfortable", "full").aspectRatio).toBe("16 / 10");
    }
  });

  // Three, and they are three sizes of one card. A picker with five entries
  // was a decision where a size control was wanted.
  it("offers three modes", () => {
    expect(VIEW_MODES.map((mode) => mode.value)).toEqual([
      "grid",
      "compact",
      "large",
    ]);
  });

  // No mode overrides the label setting any more. Cinematic did, stepping
  // "full" down to the title alone, and went with the mode.
  it("passes the label setting straight through in every mode", () => {
    for (const { value } of VIEW_MODES) {
      expect(cardLayout(400, value, "comfortable", "full").tileInfo).toBe("full");
      expect(cardLayout(400, value, "comfortable", "none").tileInfo).toBe("none");
    }
  });

  it("reports the shape as a ratio the grid can estimate row heights with", () => {
    expect(cardLayout(400, "grid", "comfortable", "full").heightRatio).toBeCloseTo(10 / 16);
    // A NaN here would collapse the scrollbar.
    for (const { value } of VIEW_MODES) {
      const { heightRatio } = cardLayout(400, value, "comfortable", "full");
      expect(Number.isFinite(heightRatio)).toBe(true);
      expect(heightRatio).toBeGreaterThan(0);
    }
  });

  it("falls back rather than returning undefined for an unknown mode", () => {
    // A value hand-edited into stored settings must not break the grid.
    const layout = cardLayout(400, "nonsense" as never, "nonsense" as never, "full");
    expect(layout.widthPx).toBe(400);
    expect(layout.aspectRatio).toBe("16 / 10");
    expect(layout.columnGapPx).toBeGreaterThan(0);
  });
});

describe("the presets as actually rendered", () => {
  // The failure this guards against is not a crash: it is four presets that
  // all look the same. The grid fits columns and then stretches them, so two
  // presets whose widths land on the same column count are indistinguishable
  // however different their numbers look here.
  const COMMON_WIDTHS = [1100, 1400, 1800];

  function columnsFor(preset: (typeof PRESETS)[number], width: number) {
    const layout = cardLayout(
      tileWidthPx(preset.settings.tileSizePercent),
      preset.settings.viewMode,
      preset.settings.density,
      preset.settings.tileInfo,
    );
    return columnsForWidth(width, layout.widthPx, layout.columnGapPx);
  }

  const byName = (width: number) =>
    Object.fromEntries(PRESETS.map((p) => [p.value, columnsFor(p, width)]));

  it("fits steadily fewer, larger cards from Detailed up to Minimal", () => {
    for (const width of COMMON_WIDTHS) {
      const cols = byName(width);
      expect(cols.detailed, `at ${width}px`).toBeGreaterThan(cols.comfortable);
      expect(cols.comfortable, `at ${width}px`).toBeGreaterThan(cols.minimal);
    }
  });

  // A tile at or past 60% of the window has nothing to expand into and the
  // hover preview refuses to open. No preset should land there on an ordinary
  // desktop — the widest one used to, which is how that was noticed.
  it("never sizes a preset past the point where hovering stops working", () => {
    for (const preset of PRESETS) {
      expect(columnsFor(preset, 1800), `${preset.label} at 1800px`).toBeGreaterThan(1);
    }
  });

  it("labels everything on Detailed and nothing on Minimal", () => {
    const info = Object.fromEntries(
      PRESETS.map((p) => [p.value, cardLayout(400, p.settings.viewMode, p.settings.density, p.settings.tileInfo).tileInfo]),
    );
    expect(info.detailed).toBe("full");
    expect(info.minimal).toBe("none");
  });
});

describe("activePreset", () => {
  it("recognises each preset from its settings alone", () => {
    for (const preset of PRESETS) {
      expect(activePreset(preset.settings)).toBe(preset.value);
    }
  });

  it("reports Custom once a single setting is changed behind a preset", () => {
    const comfortable = PRESETS.find((p) => p.value === "comfortable")!;
    expect(activePreset({ ...comfortable.settings, density: "dense" })).toBeNull();
  });

  // The slider is part of a preset now, so nudging it has to drop to Custom
  // rather than leaving a preset highlighted that no longer describes the view.
  it("reports Custom when only the size slider is moved", () => {
    const comfortable = PRESETS.find((p) => p.value === "comfortable")!;
    expect(
      activePreset({ ...comfortable.settings, tileSizePercent: comfortable.settings.tileSizePercent + 5 }),
    ).toBeNull();
  });

  it("gives every preset its own slider position", () => {
    const sizes = PRESETS.map((p) => p.settings.tileSizePercent);
    expect(new Set(sizes).size).toBe(PRESETS.length);
  });

  it("gives every preset a distinct combination", () => {
    const seen = new Set(PRESETS.map((p) => JSON.stringify(p.settings)));
    expect(seen.size).toBe(PRESETS.length);
  });
});

describe("tile shape", () => {
  // Every assertion below reads the ratio from SHAPE_ASPECT rather than
  // restating it. The exact portrait ratio is a taste setting that gets tuned
  // against the real page, and a test that hardcodes it turns each tweak into
  // a failing build — which is exactly what happened, twice, and taught
  // nothing either time. What must hold is the *behaviour*: portrait is
  // taller than it is wide, landscape is unchanged, and neither can come back
  // undefined.
  const ratio = (shape: "landscape" | "portrait") =>
    SHAPE_ASPECT[shape].h / SHAPE_ASPECT[shape].w;

  const css = (shape: "landscape" | "portrait") =>
    `${SHAPE_ASPECT[shape].w} / ${SHAPE_ASPECT[shape].h}`;

  it("crops to the shape asked for", () => {
    for (const { value } of TILE_SHAPES) {
      expect(cardLayout(400, "grid", "comfortable", "full", value).aspectRatio).toBe(css(value));
    }
  });

  // The one number that is not a taste setting: changing it would redraw every
  // existing library, so it is pinned deliberately.
  it("leaves landscape at the ratio the app has always drawn", () => {
    expect(cardLayout(400, "grid", "comfortable", "full", "landscape").aspectRatio).toBe("16 / 10");
  });

  it("makes portrait taller than wide, and taller than landscape", () => {
    expect(ratio("portrait")).toBeGreaterThan(1);
    expect(ratio("landscape")).toBeLessThan(1);
    expect(ratio("portrait")).toBeGreaterThan(ratio("landscape"));
  });

  // Landscape is the default argument, so every call site that predates the
  // setting — and any that is missed later — draws what it always drew.
  it("defaults to landscape when no shape is passed", () => {
    expect(cardLayout(400, "grid", "comfortable", "full").aspectRatio).toBe("16 / 10");
    expect(cardChrome("comfortable", "full").aspectRatio).toBe("16 / 10");
  });

  // Same invariant the view modes have: the shape is the crop, the mode is
  // the width, and neither may quietly become the other.
  it("holds the shape across every mode and density", () => {
    for (const { value } of VIEW_MODES) {
      expect(cardLayout(400, value, "dense", "full", "portrait").aspectRatio).toBe(css("portrait"));
      expect(cardLayout(400, value, "spacious", "full", "portrait").aspectRatio).toBe(
        css("portrait")
      );
    }
  });

  // A NaN here would collapse the virtualized grid's scrollbar, which is why
  // the ratio is carried as numbers rather than parsed back out of the string.
  it("reports a usable height ratio for both shapes", () => {
    for (const { value } of TILE_SHAPES) {
      const { heightRatio } = cardLayout(400, "grid", "comfortable", "full", value);
      expect(heightRatio).toBeCloseTo(ratio(value));
      expect(Number.isFinite(heightRatio)).toBe(true);
      expect(heightRatio).toBeGreaterThan(0);
    }
  });

  // Without the width scale, choosing portrait globally is a size change
  // wearing a shape's clothes: the same column width at a tall ratio is a much
  // bigger card, and the size slider stops meaning one thing.
  //
  // A loose bound on purpose. The scale is a rounded constant and the ratio is
  // tunable, so pinning this tightly would break on the next tweak — but a
  // portrait column that stopped being narrower, or grew to twice the area,
  // would be a real regression.
  it("narrows the column for portrait, so a card stays comparable in size", () => {
    const landscape = cardLayout(400, "grid", "comfortable", "full", "landscape");
    const portrait = cardLayout(400, "grid", "comfortable", "full", "portrait");

    expect(portrait.widthPx).toBeLessThan(landscape.widthPx);

    const area = (l: { widthPx: number; heightRatio: number }) =>
      l.widthPx * l.widthPx * l.heightRatio;
    const factor = area(portrait) / area(landscape);
    expect(factor).toBeGreaterThan(0.6);
    expect(factor).toBeLessThan(1.6);
  });

  // Stored settings are hand-editable and arrive from a server that may be a
  // version ahead. "undefined / undefined" reaches CSS as an invalid value
  // and collapses every frame in the app.
  it("falls back to landscape rather than returning undefined for an unknown shape", () => {
    const layout = cardLayout(400, "grid", "comfortable", "full", "tall" as never);
    expect(layout.aspectRatio).toBe("16 / 10");
    expect(Number.isFinite(layout.heightRatio)).toBe(true);
    expect(layout.widthPx).toBe(400);
  });

  // A tile's width is its column's, and the column is sized for the global
  // shape. Left alone, a portrait tile in a landscape grid keeps the full
  // width and stands two and a half times the height of its neighbours.
  describe("a tile whose shape differs from its column", () => {
    it("takes the whole column when the shapes agree", () => {
      expect(tileWidthFraction("landscape", "landscape")).toBe(1);
      expect(tileWidthFraction("portrait", "portrait")).toBe(1);
    });

    it("narrows a portrait tile in a landscape column", () => {
      expect(tileWidthFraction("portrait", "landscape")).toBeLessThan(1);
      expect(tileWidthFraction("portrait", "landscape")).toBeGreaterThan(0);
    });

    // The point of the whole exercise, stated in the terms the eye judges it
    // by, so it survives either ratio being tuned.
    it("leaves a portrait tile only a little taller than a landscape one", () => {
      const fraction = tileWidthFraction("portrait", "landscape");
      const portraitHeight = fraction * (SHAPE_ASPECT.portrait.h / SHAPE_ASPECT.portrait.w);
      const landscapeHeight = SHAPE_ASPECT.landscape.h / SHAPE_ASPECT.landscape.w;

      expect(portraitHeight / landscapeHeight).toBeCloseTo(PORTRAIT_HEIGHT_FACTOR, 2);
    });

    // A shorter tile already takes less room than its neighbours; widening it
    // past its column would push into the next one.
    it("never widens a tile beyond its column", () => {
      expect(tileWidthFraction("landscape", "portrait")).toBe(1);
    });

    // Stored shapes are hand-editable, and a NaN width would collapse the tile.
    it("returns a usable fraction for an unknown shape", () => {
      const fraction = tileWidthFraction("tall" as never, "landscape");
      expect(Number.isFinite(fraction)).toBe(true);
      expect(fraction).toBeGreaterThan(0);
      expect(fraction).toBeLessThanOrEqual(1);
    });
  });

  // Two, not three. The size control above it already has three stops; this
  // is a flip between the two shapes artwork actually comes in.
  it("offers exactly the two shapes", () => {
    expect(TILE_SHAPES.map((shape) => shape.value)).toEqual(["landscape", "portrait"]);
  });
});
