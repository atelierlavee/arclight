// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Portal } from "./Portal";
import { PrivacyUnlockForm } from "./PrivacyUnlockForm";
import { settingsInputClass } from "./SettingsSection";
import { usePrivacyGuard } from "@/lib/privacyGuard";
import { proofFor, type Proof } from "@/lib/profilesApi";
import { useFocusTrap } from "@/lib/useFocusTrap";

/**
 * "Confirm it's you" — asked before any change to a profile is saved. Touch
 * ID (or the privacy password) where one is set up, otherwise or as well
 * the account password (the owner) or the profile's PIN (anyone else).
 *
 * `run` is the save itself, given the proof to send: null after Touch ID,
 * whose unlock the server already remembers. A failed save (a wrong
 * password, say) stays in the dialog to try again; a successful one closes
 * it.
 */
export function ConfirmIdentityDialog({
  isOwner,
  run,
  onClose,
}: {
  isOwner: boolean;
  run: (proof: Proof | null) => Promise<void>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);
  const { guarded } = usePrivacyGuard();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function attempt(proof: Proof | null) {
    setBusy(true);
    setProblem(null);
    try {
      await run(proof);
      onClose();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  const label = isOwner ? "Account password" : "Profile PIN";

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) onClose();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) onClose();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm it's you"
          className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-5 shadow-2xl"
        >
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="size-5 text-primary" />
            <div>
              <h2 className="font-semibold">Confirm it’s you</h2>
              <p className="text-xs text-muted-foreground">Needed before changing a profile.</p>
            </div>
          </div>

          {/* Touch ID, or the privacy password, where one is set up. */}
          {guarded && (
            <>
              <PrivacyUnlockForm onUnlocked={() => void attempt(null)} />
              <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (secret) void attempt(proofFor(isOwner, secret));
            }}
            className="space-y-2"
          >
            <input
              type="password"
              inputMode={isOwner ? undefined : "numeric"}
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder={label}
              aria-label={label}
              autoComplete={isOwner ? "current-password" : "off"}
              autoFocus={!guarded}
              className={settingsInputClass}
            />
            {problem && <p className="text-xs text-destructive">{problem}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!secret || busy}
                className="flex items-center gap-2 rounded-md bg-white px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                Confirm
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  );
}
