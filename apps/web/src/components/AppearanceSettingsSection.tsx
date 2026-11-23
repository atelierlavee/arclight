// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { HOME_ROWS, readHomeRows, useAppearance } from "@/lib/appearance";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Eye, EyeOff, RotateCcw } from "lucide-react";
import { SettingsSection } from "./SettingsSection";

/**
 * The half of the appearance settings you set once.
 *
 * The one appearance choice that isn't a look but a layout: which sections
 * the homepage has, and in what order. Everything else is in the header
 * panel, where you can judge it against the page. This is an eight-row
 * editor you touch once, and it was never going to fit a 288px dropdown.
 */
export function AppearanceSettingsSection() {
  const { homeRows, set } = useAppearance();

  const rowLabels = new Map(HOME_ROWS.map((row) => [row.key, row.label]));

  /** Moves one section past its neighbour, leaving the rest in place. */
  function moveRow(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= homeRows.length) return;
    const next = [...homeRows];
    [next[index], next[target]] = [next[target], next[index]];
    set({ homeRows: next });
  }

  function toggleRow(index: number) {
    set({
      homeRows: homeRows.map((row, i) => (i === index ? { ...row, visible: !row.visible } : row)),
    });
  }

  return (
    <SettingsSection
      title="Homepage layout"
      description="Which sections the homepage shows, and in what order. Changes save as you make them."
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <ul className="space-y-0.5">
            {homeRows.map((row, index) => (
              <li key={row.key} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleRow(index)}
                  aria-pressed={row.visible}
                  title={row.visible ? "Hide this section" : "Show this section"}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-accent",
                    row.visible ? "text-foreground" : "text-muted-foreground/50"
                  )}
                >
                  {row.visible ? (
                    <Eye className="size-3.5 shrink-0" />
                  ) : (
                    <EyeOff className="size-3.5 shrink-0" />
                  )}
                  <span className="truncate">{rowLabels.get(row.key) ?? row.key}</span>
                </button>
                {/* Arrows rather than drag-and-drop: eight rows in a 288px
                    panel, and a drag would fight the panel's own
                    outside-click dismissal. */}
                <button
                  type="button"
                  onClick={() => moveRow(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${rowLabels.get(row.key)} up`}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-25 disabled:hover:bg-transparent"
                >
                  <ChevronUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveRow(index, 1)}
                  disabled={index === homeRows.length - 1}
                  aria-label={`Move ${rowLabels.get(row.key)} down`}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-25 disabled:hover:bg-transparent"
                >
                  <ChevronDown className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3">
            <span className="block text-[11px] leading-snug text-muted-foreground/70">
              Collections and Tags cover every row of that kind.
            </span>
            {/* Back to the short default home, without touching anything else. */}
            <button
              type="button"
              onClick={() => set({ homeRows: readHomeRows(undefined) })}
              className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <RotateCcw className="size-3" />
              Reset to default
            </button>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
