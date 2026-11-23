// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/lib/utils";

const SIZES = {
  sm: { word: "text-[2.6rem]", tag: "text-[9px] tracking-[0.28em]" },
  /** The top bar: a touch larger, with the tagline, fitted to its 60px height. */
  nav: { word: "text-[2.3rem]", tag: "text-[8.5px] tracking-[0.3em]" },
  md: { word: "text-4xl", tag: "text-[9px] tracking-[0.3em]" },
  lg: { word: "text-6xl md:text-7xl", tag: "text-[11px] md:text-xs tracking-[0.3em]" },
  /** Poster size: as big as the page will take. */
  hero: { word: "text-6xl md:text-[7.5rem] lg:text-[9rem]", tag: "text-xs md:text-sm tracking-[0.3em]" },
} as const;

/** The pink-to-violet of "light". */
const GRADIENT = "bg-gradient-to-r from-[#ff2d95] to-[#b026ff] bg-clip-text text-transparent";

/**
 * The Arc Light logo, set in type rather than drawn: "arc" in white, "light"
 * in the brand's pink-to-violet, heavy and tightly spaced, with the tagline
 * beneath on one line. Being text, it is sharp at every size and costs
 * nothing to load.
 */
export function BrandLogo({
  size = "md",
  tagline = true,
  className,
}: {
  size?: keyof typeof SIZES;
  tagline?: boolean;
  className?: string;
}) {
  return (
    <span role="img" aria-label="Arc Light" className={cn("inline-flex select-none flex-col items-start", className)}>
      <span className={cn("font-black leading-none tracking-[-0.045em]", SIZES[size].word)}>
        <span className="text-white">arc</span>
        <span className={GRADIENT}>light</span>
      </span>
      {tagline && (
        <span
          className={cn(
            "mt-[0.5em] whitespace-nowrap font-medium uppercase text-white/70",
            SIZES[size].tag,
          )}
        >
          Explore <span className="text-[#ff2d95]">·</span> Indulge <span className="text-[#ff2d95]">·</span> Enjoy
        </span>
      )}
    </span>
  );
}

/** The collapsed sidebar's form, where only a square fits: "al" in the same style. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Arc Light"
      className={cn("select-none text-3xl font-black leading-none tracking-[-0.06em]", className)}
    >
      <span className="text-white">a</span>
      <span className={GRADIENT}>l</span>
    </span>
  );
}
