// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** How far down the page the masthead folds into the slim bar. */
const FOLD_AT = 40;
const DURATION = 300;
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

function measure(header: HTMLElement | null): Map<Element, DOMRect> | null {
  if (!header) return null;
  const rects = new Map<Element, DOMRect>();
  for (const el of header.querySelectorAll("[data-flip]")) rects.set(el, el.getBoundingClientRect());
  return rects;
}

function reducedMotion(): boolean {
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The top bar's two shapes on a wide screen: a tall masthead at the top of
 * the page (logo centred, links on a row beneath), folding into the slim bar
 * once you scroll.
 *
 * The two shapes are plain CSS layouts (`.masthead` in index.css); what
 * moves between them is animated here. Each `[data-flip]` piece is measured
 * before the switch and after, then glides from the one place to the other —
 * so it works whatever the pieces' widths are, and a switch back mid-glide
 * starts from wherever the piece is now.
 */
export function useMasthead(enabled: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [folded, setFolded] = useState(() => window.scrollY > FOLD_AT);
  const foldedRef = useRef(folded);
  const enabledRef = useRef(enabled);
  useLayoutEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  const before = useRef<Map<Element, DOMRect> | null>(null);

  useEffect(() => {
    function onScroll() {
      const next = window.scrollY > FOLD_AT;
      if (next === foldedRef.current) return;
      foldedRef.current = next;
      // Only a wide screen has two shapes to move between.
      before.current = enabledRef.current ? measure(ref.current) : null;
      setFolded(next);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const expanded = enabled && !folded;

  useLayoutEffect(() => {
    const header = ref.current;
    const from = before.current;
    before.current = null;
    if (!header || !from || reducedMotion()) return;
    for (const el of header.querySelectorAll<HTMLElement>("[data-flip]")) {
      const start = from.get(el);
      if (!start || typeof el.animate !== "function") continue;
      // Measured in its new place without the old glide still applied.
      for (const running of el.getAnimations()) running.cancel();
      const end = el.getBoundingClientRect();
      const dx = start.left - end.left;
      const dy = start.top - end.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      el.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], {
        duration: DURATION,
        easing: EASING,
      });
    }
  }, [expanded]);

  return { ref, expanded };
}
