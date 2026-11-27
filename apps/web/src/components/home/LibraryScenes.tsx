// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useAppearance } from "@/lib/appearance";
import { fetchCategories } from "@/lib/categoryApi";
import { IMAGE_EPOCH, thumbnailUrl } from "@/lib/mediaItemApi";
import { qk } from "@/lib/queryKeys";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";

/*
 * The home page's library scene and the silk ribbons other pages borrow:
 * big type, one image at a time, edge to edge, cancelling the page's gutters.
 */

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
      <span className="h-px w-8 bg-primary/60" />
      {children}
    </p>
  );
}

/** Each poster's resting tilt and drop, so the wall looks hung by hand. */
const POSTER_TILT = [
  { rotate: -6, y: 10 },
  { rotate: 3, y: -8 },
  { rotate: -2.5, y: 14 },
  { rotate: 5, y: -4 },
];

/**
 * The library's categories as movie posters on a wall: tall frames side by
 * side, tilted and overlapping a little as if pinned up by hand. Hovering
 * one straightens it and lifts it forward; a click opens Browse there.
 * Empty categories keep their poster, greyed, so the library's shape is clear.
 */
export function LibraryScene() {
  const { data } = useQuery({ queryKey: qk.categories, queryFn: fetchCategories });
  const categories = data?.categories ?? [];
  if (categories.length < 2) return null;

  const coverOf = (index: number) => {
    const category = categories[index];
    if (category.cover) return `${category.cover}&e=${IMAGE_EPOCH}`;
    return category.representativeItemId != null ? thumbnailUrl({ id: category.representativeItemId }) : null;
  };

  return (
    <section className="relative isolate -mx-4 overflow-hidden px-6 pb-16 pt-4 md:-mx-6 md:px-14 md:pb-24 md:pt-6">
      {/* The Studios heading's silk, here wide and faint behind the wall:
          the pink runs out to the left from the box on the right, so the
          ribbons cross the whole scene. */}
      <SilkWaves className="absolute right-0 top-1/2 -z-10 h-[75%] w-[45%] -translate-y-1/2 opacity-50" />

      <div className="mb-10 flex justify-center md:mb-12">
        <Kicker>In the library</Kicker>
      </div>

      <ul className="grid grid-cols-2 justify-items-center gap-6 sm:flex sm:justify-center sm:gap-0">
        {categories.map((category, index) => {
          const tilt = POSTER_TILT[index % POSTER_TILT.length];
          const empty = category.total === 0;
          const cover = coverOf(index);
          return (
            <li
              key={category.slug}
              // The tilt lives in custom properties so hover can override it
              // from CSS alone: transform-only, so it stays smooth.
              style={{ "--tilt": `${tilt.rotate}deg`, "--drop": `${tilt.y}px` } as React.CSSProperties}
              className="relative z-0 w-full max-w-[15rem] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] [transform:rotate(var(--tilt))_translateY(var(--drop))] will-change-transform hover:z-10 hover:[transform:rotate(0deg)_translateY(-18px)_scale(1.06)] sm:w-[min(22vw,15rem)] sm:[&:not(:first-child)]:-ml-6"
            >
              <Link
                to="/browse"
                search={{ kind: category.slug }}
                className="group relative block aspect-[2/3] overflow-hidden rounded-sm bg-secondary shadow-[0_24px_50px_-18px_rgba(0,0,0,0.9)] ring-1 ring-white/10 transition-shadow duration-500 hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.95)] hover:ring-primary/60"
              >
                {cover && (
                  <img
                    src={cover}
                    alt=""
                    loading="lazy"
                    style={{
                      objectPosition: `${category.coverPositionX}% ${category.coverPositionY}%`,
                      transform: `scale(${category.coverScale / 100})`,
                      transformOrigin: `${category.coverPositionX}% ${category.coverPositionY}%`,
                    }}
                    className={cn(
                      // Black and white at rest; colour comes up on hover.
                      "sensitive absolute inset-0 size-full object-cover grayscale transition-[filter] duration-500 group-hover:grayscale-0",
                    )}
                  />
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/40" />
                {/* Poster furniture: the count up top, the title below. */}
                <span className="absolute inset-x-0 top-0 p-4 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-white/70">
                  {empty ? "Coming soon" : `${category.total.toLocaleString()} titles`}
                </span>
                <span className="absolute inset-x-0 bottom-0 p-4 text-center md:p-5">
                  <span className="block text-base font-semibold uppercase leading-none tracking-[0.3em] text-white md:text-lg">
                    {category.label}
                  </span>
                  <span className="mx-auto mt-3 block h-px w-10 bg-primary transition-all duration-500 group-hover:w-20" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The silk's canvas, in its own units. */
const SILK_W = 600;
const SILK_H = 300;

/**
 * One ribbon of silk as many fine lines: each a wave, the waves shifting
 * step by step from one shape to another, so together they twist like
 * fabric. Worked out once, at load, since it never changes.
 */
function silkRibbon(
  lines: number,
  from: { amp: number; phase: number; offset: number },
  to: { amp: number; phase: number; offset: number },
  width = SILK_W,
  waves = 1.15,
): string[] {
  const out: string[] = [];
  for (let line = 0; line < lines; line++) {
    const t = line / (lines - 1);
    const amp = from.amp + (to.amp - from.amp) * t;
    const phase = from.phase + (to.phase - from.phase) * t;
    const offset = from.offset + (to.offset - from.offset) * t;
    let d = "";
    for (let x = 0; x <= width; x += 8) {
      const u = x / width;
      // Swells in the middle and eases off at the ends.
      const swell = 0.55 + 0.45 * Math.sin(u * Math.PI);
      const y = SILK_H / 2 + offset + amp * swell * Math.sin(u * Math.PI * 2 * waves + phase);
      d += `${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)} `;
    }
    out.push(d);
  }
  return out;
}

/** The pink ribbon runs this many times the box's width, out to the left. */
const PINK_REACH = 2.2;
const SILK_PINK = silkRibbon(
  46,
  { amp: 70, phase: 0, offset: -10 },
  { amp: 40, phase: 1.6, offset: 20 },
  SILK_W * PINK_REACH,
  1.15 * PINK_REACH,
);
const SILK_VIOLET = silkRibbon(36, { amp: 55, phase: 2.4, offset: 10 }, { amp: 85, phase: 3.6, offset: -15 });

// The same ribbons a moment later in their sway: phase moved on, the twist
// a little different. Each line morphs to its twin and back, so the silk
// moves like fabric in a draught. Same number of points, so they morph cleanly.
const SILK_PINK_SWAY = silkRibbon(
  46,
  { amp: 58, phase: 0.9, offset: 0 },
  { amp: 52, phase: 2.3, offset: 10 },
  SILK_W * PINK_REACH,
  1.15 * PINK_REACH,
);
const SILK_VIOLET_SWAY = silkRibbon(
  36,
  { amp: 68, phase: 3.1, offset: 0 },
  { amp: 70, phase: 4.5, offset: -5 },
);

/** An eased there-and-back for a path's shape. */
function Sway({ from, to, seconds }: { from: string; to: string; seconds: number }) {
  return (
    <animate
      attributeName="d"
      values={`${from};${to};${from}`}
      keyTimes="0;0.5;1"
      calcMode="spline"
      keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
      dur={`${seconds}s`}
      repeatCount="indefinite"
    />
  );
}

/**
 * Two ribbons of silk — pink and violet — drawn as fine lines twisting past
 * each other, fading in from the left so they rise out of the words beside
 * them. Purely decorative.
 */
export function SilkWaves({ className }: { className?: string }) {
  const { motion } = useAppearance();
  const osReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  // Still on a phone: the ribbons' morphing paths are animated SVG, which
  // Safari on an iPhone redraws in full every frame.
  const touch = useMediaQuery("(hover: none) and (pointer: coarse)");
  const animated = motion === "full" && !osReducedMotion && !touch;
  return (
    <div aria-hidden className={cn("pointer-events-none relative", className)}>
      {/* Pink runs long, out to the left behind the words, fading in. */}
      <svg
        viewBox={`0 0 ${SILK_W * PINK_REACH} ${SILK_H}`}
        preserveAspectRatio="none"
        fill="none"
        className="absolute right-0 top-0 h-full"
        style={{ width: `${PINK_REACH * 100}%` }}
      >
        <defs>
          <linearGradient id="silk-pink" x1="0" x2="1">
            <stop offset="0" stopColor="#ff2d95" stopOpacity="0" />
            <stop offset="0.35" stopColor="#ff2d95" />
            <stop offset="1" stopColor="#ff7ac0" />
          </linearGradient>
        </defs>
        {SILK_PINK.map((d, index) => (
          <path key={index} d={d} stroke="url(#silk-pink)" strokeWidth="0.8" opacity="0.55">
            {animated && <Sway from={d} to={SILK_PINK_SWAY[index]} seconds={9} />}
          </path>
        ))}
      </svg>
      {/* Violet stays within the box. */}
      <svg
        viewBox={`0 0 ${SILK_W} ${SILK_H}`}
        preserveAspectRatio="none"
        fill="none"
        className="absolute inset-0 size-full"
      >
        <defs>
          <linearGradient id="silk-violet" x1="0" x2="1">
            <stop offset="0" stopColor="#b026ff" stopOpacity="0" />
            <stop offset="0.35" stopColor="#b026ff" />
            <stop offset="1" stopColor="#7b2cff" />
          </linearGradient>
        </defs>
        {SILK_VIOLET.map((d, index) => (
          <path key={index} d={d} stroke="url(#silk-violet)" strokeWidth="0.8" opacity="0.45">
            {animated && <Sway from={d} to={SILK_VIOLET_SWAY[index]} seconds={7} />}
          </path>
        ))}
      </svg>
    </div>
  );
}
