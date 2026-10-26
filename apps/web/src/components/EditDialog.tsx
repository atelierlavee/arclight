import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Portal } from "./Portal";
import { useFocusTrap } from "@/lib/useFocusTrap";

/**
 * The shell every small edit form shares: dimmed backdrop, a titled panel,
 * and the app's usual dismissal — Escape (stopped here, so it does not also
 * close what is behind), the ×, or a click outside.
 */
export function EditDialog({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(dialogRef);

  // In a ref so the listener below is added once, not on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="max-h-full w-full max-w-lg space-y-4 overflow-y-auto rounded-lg bg-background p-5 text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="truncate text-sm font-semibold">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </Portal>
  );
}

/** The full-width save button at the foot of an edit form. */
export function SaveButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
    >
      Save
    </button>
  );
}
