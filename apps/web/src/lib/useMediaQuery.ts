// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";

// Tailwind's `md`. The mobile layout is a genuinely different shape — an
// off-canvas sidebar rather than a column beside the content — so it needs a
// value in JS, not only a class prefix.
const MOBILE_QUERY = "(max-width: 767.98px)";

function match(query: string): boolean {
  // jsdom has no matchMedia, and neither does a server render.
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => match(query));

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    // Re-read on subscribe: the viewport can have changed between the first
    // render and this effect.
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** True on phone-width viewports, where the shell switches to a drawer. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
