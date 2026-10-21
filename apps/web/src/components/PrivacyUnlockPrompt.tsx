import { useEffect, useRef, useState } from "react";
import { ShieldAlert } from "lucide-react";
import {
  PRIVACY_UNLOCK_EVENT,
  type PrivacyUnlockRequest,
} from "@/lib/privacyLock";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { Portal } from "./Portal";
import { PrivacyUnlockForm } from "./PrivacyUnlockForm";

/**
 * The privacy prompt for actions refused mid-flight.
 *
 * Deleting a backup, clearing the activity log, purging a folder's data —
 * the server refuses these until the session has proved the privacy
 * credential, and the unlock lapses on its own. Rather than every one of
 * those buttons carrying its own form, they ask through
 * `withPrivacyUnlock`, which lands here and retries once this resolves.
 *
 * Several requests while open share the one prompt: one unlock answers all.
 */
export function PrivacyUnlockPrompt() {
  const [pending, setPending] = useState<PrivacyUnlockRequest[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const open = pending.length > 0;
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    function onRequest(event: Event) {
      const request = (event as CustomEvent<PrivacyUnlockRequest>).detail;
      if (!request) return;
      request.handled = true;
      setPending((current) => [...current, request]);
    }
    window.addEventListener(PRIVACY_UNLOCK_EVENT, onRequest);
    return () => window.removeEventListener(PRIVACY_UNLOCK_EVENT, onRequest);
  }, []);

  function settle(unlocked: boolean) {
    setPending((current) => {
      for (const request of current) request.resolve(unlocked);
      return [];
    });
  }

  // Unanswered requests are refused, not left hanging, if this goes away.
  const latest = useRef(pending);
  useEffect(() => {
    latest.current = pending;
  }, [pending]);
  useEffect(
    () => () => {
      for (const request of latest.current) request.resolve(false);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        settle(false);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  if (!open) return null;

  return (
    <Portal>
      <div
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) settle(false);
        }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="privacy-unlock-title"
          className="w-80 space-y-3 rounded-xl border border-border bg-card p-4 shadow-2xl"
        >
          <div className="space-y-1">
            <h2
              id="privacy-unlock-title"
              className="flex items-center gap-2 text-sm font-semibold"
            >
              <ShieldAlert className="size-4 text-amber-500" />
              Unlock to continue
            </h2>
            <p className="text-[11px] leading-snug text-muted-foreground">
              This can’t be undone, so it needs your privacy password or passkey.
            </p>
          </div>
          <PrivacyUnlockForm
            onUnlocked={() => settle(true)}
            onCancel={() => settle(false)}
          />
        </div>
      </div>
    </Portal>
  );
}
