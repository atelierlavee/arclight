import { useEffect, useRef } from "react";
import { QrCode as QrIcon, X } from "lucide-react";
import { Portal } from "./Portal";
import { QrCode } from "./QrCode";
import { useFocusTrap } from "@/lib/useFocusTrap";

/**
 * The server's address as a large QR code, for a phone to scan.
 *
 * A dialog rather than a code drawn in the settings card: at card size it
 * competed with the controls around it and was small enough that a camera
 * held at arm's length struggled, and most of the time you visit this card
 * for the switch, not the code.
 *
 * Same dismissal as the app's other dialogs — Escape (stopped here, so it
 * doesn't also close whatever is behind), the ×, or a click outside.
 */
export function QrCodeDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  // Held in a ref so the setup below runs once per opening. Callers pass an
  // inline arrow, and depending on it directly would re-run the effect — and
  // pull focus back to the × — on every render of the page behind.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <Portal>
      <div
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-dialog-title"
          className="animate-soft-pop w-full max-w-xs space-y-4 rounded-xl border border-border bg-card p-5 text-center shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <h2 id="qr-dialog-title" className="flex items-center gap-2 text-sm font-semibold">
              <QrIcon className="size-4" />
              Open on your phone
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex justify-center">
            <QrCode value={url} size={240} label={`QR code for ${url}`} />
          </div>

          <div className="space-y-1">
            <code className="block truncate text-sm text-foreground">{url}</code>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Point your phone's camera at the code. The phone has to be on the same wifi, and
              you'll sign in there as usual.
            </p>
          </div>
        </div>
      </div>
    </Portal>
  );
}
