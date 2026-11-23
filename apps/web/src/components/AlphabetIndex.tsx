// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/lib/utils";

const LETTERS = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

function initialOf(value: string): string {
  const first = value.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : "#";
}

export function AlphabetIndex({
  value,
  onChange,
  available,
}: {
  value: string | null;
  onChange: (letter: string | null) => void;
  available: string[];
}) {
  const letters = new Set(available.map(initialOf));
  const selected = value;

  return (
    <nav
      aria-label="Filter by first letter"
      // One scrolling strip on a phone rather than wrapped rows: 27 buttons
      // centre-justified over three lines left two ragged short rows under a
      // full one, which read as broken rather than as an index.
      className="scrollbar-hide -mx-4 flex items-center gap-x-1 gap-y-1 overflow-x-auto border-b border-border/70 px-4 pb-3 md:mx-0 md:flex-wrap md:justify-center md:overflow-visible md:px-0"
    >
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        className={cn(
          "min-w-8 shrink-0 rounded px-2 py-1.5 text-xs font-medium transition-colors md:py-1",
          selected === null
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        All
      </button>
      {LETTERS.map((letter) => {
        const enabled = letters.has(letter);
        return (
          <button
            key={letter}
            type="button"
            onClick={() => enabled && onChange(letter)}
            disabled={!enabled}
            aria-pressed={value === letter}
            className={cn(
              "min-w-7 shrink-0 rounded px-1.5 py-1.5 text-xs font-medium transition-colors md:py-1",
              selected === letter
                ? "bg-foreground text-background"
                : enabled
                  ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                  : "cursor-not-allowed text-muted-foreground/25",
            )}
          >
            {letter}
          </button>
        );
      })}
    </nav>
  );
}
