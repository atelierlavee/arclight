import { createPortal } from "react-dom";
import { useScrollLock } from "@/lib/scrollLock";

/**
 * Renders children at the end of <body>, outside the page's layout, and holds
 * the page still underneath them.
 *
 * Overlays need the portal. `position: fixed` and a high z-index are not
 * enough on their own: any ancestor with a transform, filter, or an animated
 * opacity creates a stacking context, and a child's z-index is then only
 * meaningful *inside* it. `<main>` carries `animate-fade-in`, which animates
 * opacity, so every modal rendered inside it was confined below the sticky
 * header — z-50 lost to the header's z-30 because they were never being
 * compared.
 */
export function Portal({
  children,
  lockPageScroll = true,
}: {
  children: React.ReactNode;
  lockPageScroll?: boolean;
}) {
  useScrollLock(lockPageScroll);

  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
