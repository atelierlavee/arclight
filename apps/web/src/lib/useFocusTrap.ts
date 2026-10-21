import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * The traps currently active, innermost last.
 *
 * Only the top one acts: the lightbox opens over the detail modal, and both
 * moving focus on the same Tab would leave it in whichever ran second.
 */
const stack: symbol[] = [];

/**
 * Keeps Tab and Shift+Tab inside a modal dialog while `active`.
 *
 * Without it, Tab walks out of the dialog into the page behind — controls
 * that are covered, and that a screen reader was told (via aria-modal) do not
 * exist. Only the wrapping is handled here; where focus starts and where it
 * returns stay with each dialog, which already know what makes sense.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active = true,
): void {
  useEffect(() => {
    if (!active) return;
    const token = Symbol("focus-trap");
    stack.push(token);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || event.defaultPrevented) return;
      if (stack[stack.length - 1] !== token) return;
      const container = ref.current;
      if (!container) return;

      const current = document.activeElement;
      const inside = current instanceof Node && container.contains(current);
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.closest("[hidden], [inert]"));

      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!inside) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (current === first || current === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const index = stack.indexOf(token);
      if (index !== -1) stack.splice(index, 1);
    };
  }, [ref, active]);
}
