// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { formatBytes, type BackupFile } from "@/lib/backupApi";
import { restoreConfirmMatches, restoreConfirmPhrase } from "@/lib/restoreConfirm";

/**
 * The confirmation standing in front of the only irreversible action here.
 *
 * Says what is lost rather than asking "are you sure": what replaces the
 * library, that the account comes from the archive too, and that a snapshot of
 * the current state is taken first — which is the fact that makes going ahead
 * a reasonable thing to do.
 */
export function RestoreBackupDialog({
  backup,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  backup: BackupFile;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const phrase = restoreConfirmPhrase(backup.name);
  const confirmed = restoreConfirmMatches(backup.name, typed);

  return (
    <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <div className="min-w-0 space-y-2 text-sm">
          <p className="font-semibold tracking-tight">
            Replace the library with this backup?
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {backup.name} · {formatBytes(backup.sizeBytes)}
          </p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            <li>
              Everything added since it was taken is removed — videos, tags,
              performers, watch history.
            </li>
            <li>
              Your sign-in comes from the backup too, so you'll be signed out
              and will need the password you had then.
            </li>
            <li>
              Poster frames and preview clips aren't in a backup; run a scan
              afterwards to rebuild them from your video files.
            </li>
            <li className="text-foreground">
              A backup of the library as it is right now is taken first, so this
              can be undone.
            </li>
          </ul>
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs text-muted-foreground">
          Type <span className="font-mono text-foreground">{phrase}</span> — the
          date of the backup you picked — to confirm.
        </span>
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          disabled={pending}
          autoFocus
          spellCheck={false}
          placeholder={phrase}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm outline-none focus:border-foreground/40 disabled:opacity-50"
        />
      </label>

      {error && (
        <p className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={!confirmed || pending}
          className="flex items-center gap-2 rounded-md bg-destructive/90 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-destructive disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RotateCcw className="size-4" />
          )}
          {pending ? "Restoring…" : "Restore"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
        {pending && (
          <span className="text-xs text-muted-foreground">
            Don't close this tab — it takes a moment.
          </span>
        )}
      </div>
    </div>
  );
}
