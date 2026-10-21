/** Studio colours, for the styles that use them; the rest share `OTHER`. */
export const STUDIO_COLOURS = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#f87171", "#22d3ee", "#fb923c"];
export const OTHER = "#8a8a8a";

export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * How the graph is dressed: studio-colour rings and lines, shadows, and a
 * glow on whatever you're looking at. Tune by eye.
 */
export type Look = {
  /** Portrait rings in the studio's colour rather than a neutral hairline. */
  studioRings: boolean;
  ringPx: number;
  /** Lines blend between the two ends' studio colours. */
  tintedLines: boolean;
  /** A soft shadow under every portrait, lifting it off the background. */
  shadows: boolean;
  /** Glow strength on whatever you're looking at; 0 for none. */
  glow: number;
  /** A gentle radial gradient instead of a flat background. */
  vignette: boolean;
  /** Soft glows of studio colour behind everything; their strength, 0 for none. */
  glows: number;
  /**
   * A graph-paper grid that pans and zooms with the graph: opacity of the
   * fine lines and of every fourth, brighter one. 0 for none.
   */
  grid: { minor: number; major: number };
  /** Studio chips: plain, with a coloured dot, or tinted all over. */
  chip: "plain" | "dot" | "tinted";
  /** Portrait size multiplier. */
  scale: number;
  /** Screen size (px) of a portrait at which name plates replace plain names. */
  platesAt: number;
};
export const LOOK: Look = {
  studioRings: true,
  ringPx: 2.25,
  tintedLines: true,
  shadows: true,
  glow: 24,
  vignette: true,
  platesAt: 30,
  glows: 0.14,
  grid: { minor: 0.045, major: 0.1 },
  chip: "tinted",
  scale: 1.25,
};

/**
 * The shared palette every look draws with. Tune by eye.: the graph is read
 * by its shape and its faces, and colour competed with both. Tune by eye.
 */
export const STYLE = {
  background: "#111111",
  /** Lines are hairlines; a stronger link is brighter, not thicker. */
  lineAlpha: { weakest: 0.08, strongest: 0.3, active: 0.7 },
  lineWidthPx: 1,
  /** The hairline round every portrait, and the selected one's outline. */
  ring: "rgba(255,255,255,0.16)",
  ringActive: "rgba(255,255,255,0.9)",
  placeholder: "#1e1e1e",
  initials: "rgba(255,255,255,0.45)",
  label: "rgba(255,255,255,0.72)",
  labelActive: "rgba(255,255,255,0.95)",
  labelPx: 11,
  /** Studios are drawn as chips, like the studio chips on the library page. */
  chip: "#1c1c1c",
  chipBorder: "rgba(255,255,255,0.14)",
  chipText: "rgba(255,255,255,0.85)",
  chipPx: 12,
  /** How faint everything else gets while you're looking at someone. */
  dimmed: 0.14,
  favourite: "#ef4444",
};

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const FADE_MS = 450;
export const CAMERA_MS = 420;
