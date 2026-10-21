import { useEffect } from "react";

/**
 * How many overlays are currently open.
 *
 * Ref-counted because they nest: the gallery lightbox opens on top of the
 * detail modal, and closing the inner one must not unlock the page while the
 * outer is still covering it.
 */
let openOverlays = 0;
let restoreOverflow = "";
let restorePaddingRight = "";

function lockScroll(): void {
  openOverlays += 1;
  if (openOverlays > 1) return;

  const { body } = document;
  restoreOverflow = body.style.overflow;
  restorePaddingRight = body.style.paddingRight;

  // Removing the scrollbar would otherwise let the page jump sideways as it
  // reclaims that width. Only pads when a scrollbar actually takes up space —
  // it's zero for the overlay scrollbars macOS uses by default.
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  body.style.overflow = "hidden";
}

function unlockScroll(): void {
  openOverlays = Math.max(0, openOverlays - 1);
  if (openOverlays > 0) return;

  document.body.style.overflow = restoreOverflow;
  document.body.style.paddingRight = restorePaddingRight;
}

/**
 * Holds the page still while `active`, sharing the overlays' ref count.
 *
 * For surfaces that cover the page without portalling — the mobile sidebar
 * drawer — so they and the modals can't each restore an overflow the other
 * set and leave the page locked (or unlocked) behind them.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    lockScroll();
    return unlockScroll;
  }, [active]);
}
