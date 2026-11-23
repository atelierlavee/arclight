// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Portal } from "./Portal";

export type ContextMenuEntry =
  | {
      label: string;
      icon?: LucideIcon;
      onSelect: () => void;
      disabled?: boolean;
      /** Renders in the destructive colour. Nothing here deletes originals. */
      danger?: boolean;
      /**
       * Marks the entry as the one currently in effect.
       *
       * `role="menuitemradio"` rather than a tick drawn into the label: a
       * screen reader then announces which of a group is selected, which a
       * character in the text does not. Entries that leave this undefined
       * stay plain `menuitem`s and are unaffected.
       */
      checked?: boolean;
    }
  | { separator: true };

export type ContextMenuState = {
  x: number;
  y: number;
  entries: ContextMenuEntry[];
};

function isAction(
  entry: ContextMenuEntry,
): entry is Extract<ContextMenuEntry, { label: string }> {
  return "label" in entry;
}

/**
 * A right-click menu, positioned at the pointer.
 *
 * One instance per surface rather than one per card: a virtualized grid
 * renders hundreds of cards, and giving each its own menu subtree would mean
 * hundreds of listeners and portals for a thing only one of them can show at
 * a time. The grid holds the state and the clicked item's actions; this only
 * draws them.
 *
 * Scroll closes it rather than following the pointer. A menu anchored to a
 * coordinate is wrong the moment the page moves underneath it, and tracking
 * the card instead would mean re-measuring a virtualized row that may have
 * been recycled out of the DOM entirely.
 */
export function ContextMenu({
  state,
  onClose,
}: {
  state: ContextMenuState | null;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(0);

  const actionIndexes = state
    ? state.entries.flatMap((entry, index) =>
        isAction(entry) && !entry.disabled ? [index] : [],
      )
    : [];

  // Flip rather than clamp when the menu would overflow. Clamping to the edge
  // puts the first item under the cursor, so the click that opened the menu
  // can land on it if the pointer is still moving.
  useLayoutEffect(() => {
    if (!state) return;
    const node = menuRef.current;
    if (!node) return;
    const { width, height } = node.getBoundingClientRect();
    const margin = 8;
    const x =
      state.x + width + margin > window.innerWidth
        ? Math.max(margin, state.x - width)
        : state.x;
    const y =
      state.y + height + margin > window.innerHeight
        ? Math.max(margin, state.y - height)
        : state.y;
    setPosition({ x, y });
  }, [state]);

  useEffect(() => {
    if (!state) return;
    setActive(actionIndexes[0] ?? 0);
    // Focusing the menu itself, not the first item: the arrow keys move a
    // highlight rather than focus, so a long menu doesn't scroll the page
    // behind it as the selection walks down.
    menuRef.current?.focus();
    // actionIndexes is derived from state and rebuilt every render; depending
    // on it here would reset the highlight on each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const close = () => onClose();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [state, onClose]);

  if (!state) return null;

  function choose(entry: ContextMenuEntry) {
    if (!isAction(entry) || entry.disabled) return;
    onClose();
    entry.onSelect();
  }

  function move(delta: number) {
    if (actionIndexes.length === 0) return;
    const current = actionIndexes.indexOf(active);
    const next =
      (current + delta + actionIndexes.length) % actionIndexes.length;
    setActive(actionIndexes[next]);
  }

  return (
    <Portal lockPageScroll={false}>
      {/* Catches the click that dismisses the menu before it reaches whatever
          is underneath — otherwise closing the menu also opens a card. */}
      <div
        className="fixed inset-0 z-[70]"
        onMouseDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label="Actions"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            move(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            move(-1);
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            const entry = state.entries[active];
            if (entry) choose(entry);
          }
        }}
        style={{ left: position.x, top: position.y }}
        className="fixed z-[71] min-w-52 overflow-hidden rounded-md border border-border bg-card py-1 shadow-2xl outline-none"
      >
        {state.entries.map((entry, index) => {
          if (!isAction(entry))
            return (
              <div
                key={`sep-${index}`}
                role="separator"
                className="my-1 h-px bg-border"
              />
            );

          const Icon = entry.icon;
          const checkable = entry.checked !== undefined;
          return (
            <button
              key={entry.label}
              type="button"
              role={checkable ? "menuitemradio" : "menuitem"}
              aria-checked={checkable ? entry.checked : undefined}
              disabled={entry.disabled}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(entry)}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors disabled:opacity-40",
                index === active && !entry.disabled && "bg-accent",
                entry.danger ? "text-destructive" : "text-foreground",
              )}
            >
              {Icon && <Icon className="size-4 shrink-0" />}
              <span className="truncate">{entry.label}</span>
              {entry.checked && (
                <Check className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>
          );
        })}
      </div>
    </Portal>
  );
}
