// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Hidden on phones: the row is a native touch scroller there, and an arrow
// parked over the first and last card costs more than it gives.
const arrowClass =
  "absolute top-1/2 z-20 hidden size-9 md:flex -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

/**
 * A titled, horizontally-scrollable row with edge arrows.
 *
 * Holds only the scroll machinery and knows nothing about what it contains,
 * so media cards and performer cards can share it rather than each carrying
 * their own copy of the ref/listener/arrow-state logic.
 *
 * `itemCount` is passed separately from `children` because the arrow state
 * has to recompute when the contents change, and children alone give no
 * dependency to key that on.
 *
 * While `loading`, the row renders whatever placeholder children the caller
 * gives it instead of collapsing to nothing. Building those here would mean
 * knowing what a tile looks like, which is exactly what this component avoids
 * — so the caller supplies the shapes and this only decides to show them.
 */
export function ScrollRow({
  title,
  titleClassName = "text-lg font-semibold tracking-tight",
  action,
  itemCount,
  loading = false,
  children,
}: {
  title: string;
  /**
   * Overrides the heading's size, for callers where the row title carries
   * more weight than it does in a home-page row. Replaces rather than
   * appends, so a caller can't end up with two conflicting text sizes.
   */
  titleClassName?: string;
  /** Optional control beside the heading, e.g. a "clear" button. */
  action?: React.ReactNode;
  itemCount: number;
  /** Render `children` as placeholders, and hold the row's space open. */
  loading?: boolean;
  children: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    // 4px slack so sub-pixel scroll positions don't leave a dead arrow.
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = scroller.current;
    el?.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el?.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [updateArrows, itemCount]);

  function scrollByPage(direction: 1 | -1) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
  }

  if (!loading && itemCount === 0) return null;

  return (
    <section className="animate-soft-pop space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className={titleClassName}>{title}</h2>
        {action}
      </div>

      <div className="relative">
        <div
          ref={scroller}
          // Runs out to the page gutter on a phone so the row reads as
          // something you scroll, rather than as cards cut off short of the
          // edge. The inset stays on wider screens, where the arrows sit.
          className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto scroll-smooth px-4 pb-3 pt-1 md:-mx-1 md:gap-4 md:px-1"
        >
          {children}
        </div>

        {!loading && canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            aria-label={`Scroll ${title} left`}
            className={`motion-arrow ${arrowClass} left-0 -translate-x-1`}
          >
            <ChevronLeft className="size-5" />
          </button>
        )}
        {!loading && canScrollRight && (
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            aria-label={`Scroll ${title} right`}
            className={`motion-arrow ${arrowClass} right-0 translate-x-1`}
          >
            <ChevronRight className="size-5" />
          </button>
        )}
      </div>
    </section>
  );
}
