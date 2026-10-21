import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A single-series bar chart in plain HTML: one neutral colour, the peak in
 * full white, 2px gaps, rounded tops, a hover tooltip per bar. One series,
 * so no legend — the heading names it.
 */
export function Bars({
  values,
  labels,
  format,
  height = "h-44",
  selected,
  onSelect,
  labelEvery = 1,
  axisLabels,
  minScale = 0,
}: {
  values: number[];
  labels: string[];
  /** Shorter labels for the axis, when the tooltip's are too long to fit. */
  axisLabels?: string[];
  /** The least the top of the chart stands for, so a few seconds don't fill it. */
  minScale?: number;
  format: (v: number) => string;
  height?: string;
  selected?: number;
  onSelect?: (index: number) => void;
  /** Show every nth axis label, for dense charts. */
  labelEvery?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const peak = Math.max(...values, minScale, 1);
  const peakIndex = values.indexOf(Math.max(...values));
  return (
    <div>
      <div className={cn("relative flex items-end gap-[2px] border-b border-border", height)}>
        {values.map((value, i) => {
          const active = selected === i || hover === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect?.(i)}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              aria-label={`${labels[i]}: ${format(value)}`}
              className={cn("group relative flex h-full flex-1 items-end", !onSelect && "cursor-default")}
            >
              <span
                className={cn(
                  "block w-full rounded-t-[4px] transition-colors",
                  value === 0
                    ? "h-[2px] bg-white/10"
                    : active
                      ? "bg-amber-300"
                      : i === peakIndex
                        ? "bg-white/90"
                        : "bg-white/35",
                )}
                style={value > 0 ? { height: `${Math.max(3, (value / peak) * 100)}%` } : undefined}
              />
              {hover === i && (
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs shadow-lg ring-1 ring-border">
                  <span className="text-muted-foreground">{labels[i]} · </span>
                  <span className="font-semibold tabular-nums">{format(value)}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-[2px] text-[11px] text-muted-foreground">
        {(axisLabels ?? labels).map((label, i) => (
          <span key={i} className={cn("flex-1 text-center", selected === i && "font-semibold text-foreground")}>
            {i % labelEvery === 0 ? label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
