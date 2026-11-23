// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/lib/utils";

/**
 * The primitives both appearance surfaces share.
 *
 * The header panel holds what you change often; Site settings holds what you
 * set once. They must look and behave identically, which means one copy of
 * each control rather than two that drift.
 */

/** A labelled switch. */
export function Toggle({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex items-start justify-between gap-3",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      )}
    >
      <span className="space-y-0.5">
        <span className="block text-xs font-medium">{label}</span>
        <span className="block text-[11px] leading-snug text-muted-foreground/70">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors",
          checked ? "bg-primary" : "bg-secondary ring-1 ring-border",
          disabled && "cursor-not-allowed"
        )}
      >
        <span
          className={cn(
            "block size-4 rounded-full transition-transform",
            checked ? "translate-x-4 bg-primary-foreground" : "translate-x-0 bg-muted-foreground"
          )}
        />
      </button>
    </label>
  );
}

/** A labelled range. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  hint: string;
  onChange: (next: number) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-baseline justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-white"
      />
      <span className="block text-[11px] leading-snug text-muted-foreground/70">{hint}</span>
    </label>
  );
}
