// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

import { CHART_COLORS as SLOT_COLORS, MAX_SLICES, REST_COLOR, type DonutSlice } from "@/lib/donut";

const SIZE = 168;
const STROKE = 26;
const RADIUS = (SIZE - STROKE) / 2;
/** The surface-coloured gap between slices, in degrees, so neighbours never touch. */
const GAP_DEGREES = 1.2;

function arcPath(startAngle: number, endAngle: number): string {
  const point = (angle: number) => {
    const radians = ((angle - 90) * Math.PI) / 180;
    return [SIZE / 2 + RADIUS * Math.cos(radians), SIZE / 2 + RADIUS * Math.sin(radians)];
  };
  const [x1, y1] = point(startAngle);
  const [x2, y2] = point(endAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${x2} ${y2}`;
}

/**
 * A donut for part-to-whole, with its legend beside it.
 *
 * The legend carries every number, so the ring only has to say "about how
 * much" — and it doubles as the table view, readable with no colour at all.
 * Hovering a slice or its legend row highlights both and puts that slice's
 * figures in the middle; otherwise the middle shows the total.
 */
export function DonutChart({
  slices,
  format,
  totalLabel,
  isRest = (slice) => slice.name === "Everything else",
  renderName,
}: {
  slices: DonutSlice[];
  format: (value: number) => string;
  totalLabel: string;
  isRest?: (slice: DonutSlice) => boolean;
  /** Draws a row's name, e.g. as a link to the studio. Plain text otherwise. */
  renderName?: (slice: DonutSlice) => ReactNode;
}) {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) return <p className="text-xs text-muted-foreground">Nothing to show yet.</p>;

  // Hues go to the named slices in order; the rest slice takes none, and
  // does not use up a slot.
  const colors = slices.map((slice, index) =>
    isRest(slice)
      ? REST_COLOR
      : SLOT_COLORS[slices.slice(0, index).filter((earlier) => !isRest(earlier)).length % MAX_SLICES],
  );

  const arcs = slices.map((slice, index) => {
    const sweep = (slice.value / total) * 360;
    const start = (slices.slice(0, index).reduce((sum, earlier) => sum + earlier.value, 0) / total) * 360;
    // A lone slice is a full ring, which an arc from a point to itself
    // cannot draw; a circle can.
    if (slices.length === 1) return { index, full: true, d: "" };
    const gap = Math.min(GAP_DEGREES, sweep / 3);
    return { index, full: false, d: arcPath(start + gap / 2, start + sweep - gap / 2) };
  });

  const shown = active !== null ? slices[active] : null;
  const percent = (value: number) => {
    const share = (value / total) * 100;
    return share < 1 ? "<1%" : `${Math.round(share)}%`;
  };

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`${totalLabel}: ${slices.map((s) => `${s.name} ${percent(s.value)}`).join(", ")}`}
          onMouseLeave={() => setActive(null)}
        >
          {arcs.map(({ index, full, d }) => {
            const common = {
              fill: "none",
              stroke: colors[index],
              strokeWidth: active === index ? STROKE + 4 : STROKE,
              opacity: active === null || active === index ? 1 : 0.35,
              className: "cursor-default transition-[opacity,stroke-width] duration-150",
              onMouseEnter: () => setActive(index),
            };
            return full ? (
              <circle key={index} cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} {...common} />
            ) : (
              <path key={index} d={d} {...common} />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-7 text-center">
          <span className="sensitive max-w-full truncate text-[11px] text-muted-foreground">
            {shown ? shown.name : totalLabel}
          </span>
          <span className="text-base font-semibold tabular-nums">{format(shown ? shown.value : total)}</span>
          {shown && <span className="text-[11px] tabular-nums text-muted-foreground">{percent(shown.value)}</span>}
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-1 sm:max-w-md" onMouseLeave={() => setActive(null)}>
        {slices.map((slice, index) => (
          <li
            key={slice.name}
            onMouseEnter={() => setActive(index)}
            title={slice.detail}
            className={cn(
              "flex items-center gap-2 rounded px-1.5 py-1 text-xs transition-colors",
              active === index && "bg-accent",
            )}
          >
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: colors[index] }} />
            <span
              className={cn(
                "sensitive min-w-0 flex-1 truncate",
                isRest(slice) ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {renderName && !isRest(slice) ? renderName(slice) : slice.name}
            </span>
            <span className="shrink-0 tabular-nums text-foreground">{format(slice.value)}</span>
            <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">{percent(slice.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
