// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronRight,
  CornerLeftUp,
  Folder,
  Home,
  Loader2,
  Plus,
  Timer,
  Trash2,
} from "lucide-react";
import {
  addRoot,
  browseFolders,
  fetchRoots,
  removeRoot,
} from "@/lib/libraryApi";
import { fetchSettings, saveScanInterval } from "@/lib/settingsApi";
import { withPrivacyUnlock } from "@/lib/privacyLock";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { SettingsSection } from "./SettingsSection";
import { qk } from "@/lib/queryKeys";

export function LibrarySettingsSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [browsing, setBrowsing] = useState(false);
  const [dir, setDir] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const { data: rootsData } = useQuery({ queryKey: qk.libraryRoots, queryFn: fetchRoots });
  const { data: settings } = useQuery({ queryKey: qk.settings, queryFn: fetchSettings });

  // Named with a trailing underscore to avoid shadowing window.setInterval.
  const setInterval_ = useMutation({
    mutationFn: saveScanInterval,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.settings }),
  });
  const { data: listing } = useQuery({
    queryKey: qk.libraryBrowse.dir(dir ?? "root"),
    queryFn: () => browseFolders(dir),
    enabled: browsing,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: qk.libraryRoots });
  }

  const add = useMutation({
    mutationFn: (p: string) => addRoot(p),
    onSuccess: () => {
      setError(null);
      setBrowsing(false);
      setDir(undefined);
      refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  // Which folder is being removed, while the keep-or-delete choice is open.
  const [removing, setRemoving] = useState<{ id: number; path: string } | null>(
    null,
  );

  const remove = useMutation({
    // Deleting the data is guarded server-side; a lock refusal asks for the
    // credential and retries rather than failing silently.
    mutationFn: ({ id, deleteData }: { id: number; deleteData: boolean }) =>
      withPrivacyUnlock(() => removeRoot(id, deleteData)),
    onSuccess: () => {
      setRemoving(null);
      refresh();
      // The cleanup panel counts what removal leaves behind, so it is wrong
      // the moment this finishes either way.
      void queryClient.invalidateQueries({ queryKey: qk.libraryCleanup });
    },
    onError: (error) =>
      toast({
        title: "Could not remove the folder",
        description: error.message,
        variant: "error",
      }),
  });

  return (
    <SettingsSection
      title="Folders to scan"
      description="Which folders the scanner looks in, and how often it checks them. You can browse your home folder and any connected drive."
    >
      <ul className="space-y-2">
        {rootsData?.roots.map((root) => (
          <li
            key={root.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2.5",
              root.reachable ? "border-border bg-card/20" : "border-amber-500/30 bg-amber-500/5",
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-md",
                root.reachable ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-500",
              )}
            >
              {root.reachable ? <Folder className="size-4" /> : <AlertTriangle className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-xs text-foreground">{root.path}</span>
              {root.reachable ? (
                <span className="block text-[11px] tabular-nums text-muted-foreground">
                  {root.files.toLocaleString()} files
                </span>
              ) : (
                <span
                  title="Left over from a previous media directory — the server can't see this path"
                  className="block text-[11px] text-amber-500"
                >
                  Unreachable — the server can't see this path
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setRemoving({ id: root.id, path: root.path })}
              disabled={remove.isPending}
              aria-label={`Stop scanning ${root.path}`}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
        {removing && (
          <li className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3">
            <div>
              <p className="text-sm font-medium">Stop scanning this folder?</p>
              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                {removing.path}
              </p>
            </div>
            {/* Asked rather than assumed: keeping the data makes re-adding the
                folder instant, and deleting it is the only way the names stop
                turning up in your lists. Only you know which this is. */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  remove.mutate({ id: removing.id, deleteData: false })
                }
                disabled={remove.isPending}
                className="rounded-md bg-secondary px-3 py-1.5 text-xs transition-colors hover:bg-accent disabled:opacity-50"
              >
                Keep its data
              </button>
              <button
                type="button"
                onClick={() =>
                  remove.mutate({ id: removing.id, deleteData: true })
                }
                disabled={remove.isPending}
                className="flex items-center gap-1.5 rounded-md bg-destructive/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-destructive disabled:opacity-50"
              >
                {remove.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Delete its data too
              </button>
              <button
                type="button"
                onClick={() => setRemoving(null)}
                disabled={remove.isPending}
                className="rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground/80">
              Keeping it means adding the folder back restores every title,
              favourite and piece of artwork. Either way your files are left
              alone.
            </p>
          </li>
        )}

        {rootsData?.roots.length === 0 && (
          <li className="rounded-lg border border-dashed border-amber-500/40 px-3 py-4 text-center text-xs text-amber-400">
            No folders yet — nothing will be found on the next scan.
          </li>
        )}
      </ul>

      {browsing ? (
        <div className="space-y-2 rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setDir(undefined)}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
                dir === undefined
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Home className="size-3" />
              Locations
            </button>
            {listing?.path && (
              <>
                <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate font-mono text-muted-foreground">
                  {listing.path}
                </span>
              </>
            )}
            {(listing?.parent || (listing?.path && !listing?.parent)) && (
              <button
                type="button"
                onClick={() =>
                  listing?.parent ? setDir(listing.parent) : setDir(undefined)
                }
                className="ml-auto flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <CornerLeftUp className="size-3" />
                Up
              </button>
            )}
          </div>

          {listing && listing.directories.length > 0 ? (
            <ul className="max-h-56 space-y-0.5 overflow-y-auto">
              {listing.directories.map((entry) => (
                <li key={entry.path} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setDir(entry.path)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded p-1.5 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    onClick={() => add.mutate(entry.path)}
                    disabled={add.isPending}
                    className="shrink-0 rounded bg-secondary px-2 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          ) : listing?.path ? (
            <p className="text-xs text-muted-foreground">No subfolders here.</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Pick a location to browse.
            </p>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center gap-2">
            {listing?.path && (
              <button
                type="button"
                onClick={() => add.mutate(listing.path!)}
                disabled={add.isPending}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                Add this folder
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setBrowsing(false);
                setDir(undefined);
                setError(null);
              }}
              className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setBrowsing(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-accent/40 hover:text-foreground"
        >
          <Plus className="size-4" />
          Add a folder
        </button>
      )}

      <div className="space-y-3 border-t border-border/70 pt-4">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Timer className="size-3.5" />
          Automatic scans
        </h4>
        <label className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/20 px-3 py-2.5 text-sm">
          <span>
            Check folders
            <span className="block text-[11px] text-muted-foreground">
              Rescan now from the overview at the top.
            </span>
          </span>
          <select
            value={settings?.scan.intervalMinutes ?? 15}
            onChange={(e) => setInterval_.mutate(Number(e.target.value))}
            disabled={setInterval_.isPending}
            className="rounded-md border border-border bg-secondary/60 px-2.5 py-1.5 text-sm outline-none focus:border-ring/60 disabled:opacity-50"
          >
            {(settings?.scanIntervals ?? [0, 5, 15, 30, 60, 180]).map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 0
                  ? "Never"
                  : minutes < 60
                    ? `Every ${minutes} minutes`
                    : `Every ${minutes / 60} hour${minutes === 60 ? "" : "s"}`}
              </option>
            ))}
          </select>
        </label>

        <p className="text-[11px] text-muted-foreground/70">
          A scan isn’t free — it checks every known file — so pick an interval that suits how
          often you add things rather than the shortest one.
        </p>
      </div>

      <p className="text-[11px] text-muted-foreground/70">
        Removing a folder doesn’t delete anything. Its videos are marked missing on the next
        scan, and come back if you add it again.
      </p>
    </SettingsSection>
  );
}
