import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileQuestion, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { MediaCard } from "./MediaCard";
import { useToast } from "@/lib/toast";
import { formatBytes } from "@/lib/statsApi";
import { tileWidthPx, useAppearance } from "@/lib/appearance";
import { cardLayout } from "@/lib/layout";
import {
  fetchMissing,
  forgetAllMissing,
  forgetMissing,
  PrivacyLockedError,
  type MissingVideo,
} from "@/lib/missingApi";
import { qk } from "@/lib/queryKeys";

function formatDate(value: string | null): string {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

/**
 * Videos whose files have gone, as artwork you can pick through.
 *
 * A grid rather than a list of filenames: the poster was generated at scan
 * time and is still cached, so you can recognise what a row actually was
 * before deciding to drop it — which is the whole question this page asks.
 *
 * "Remove" only ever forgets the library's record of an item: its row, tags,
 * performers, saved position, and the artwork this app generated. The
 * originals are mounted read-only and are already gone, which is exactly why
 * the button can be offered at all.
 */
export function MissingSection({ onLocked }: { onLocked?: () => void }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: qk.missingVideos,
    queryFn: fetchMissing,
    // A locked session is answered by the prompt, not by retrying into a wall.
    retry: (_count, err) => !(err instanceof PrivacyLockedError),
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { tileSizePercent, tileInfo, viewMode, tileShape, density } = useAppearance();
  const layout = cardLayout(
    tileWidthPx(tileSizePercent),
    viewMode,
    density,
    tileInfo,
    tileShape,
  );
  const tileWidth = layout.widthPx;
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Two steps for "Remove all", one for a selection you had to build by hand.
  const [confirmingAll, setConfirmingAll] = useState(false);

  const items = data?.items ?? [];

  function settle(removed: number) {
    setSelected(new Set());
    setConfirmingAll(false);
    void queryClient.invalidateQueries({ queryKey: qk.missingVideos });
    // The health panel counts these, so it is wrong the moment this succeeds.
    void queryClient.invalidateQueries({ queryKey: qk.libraryStats });
    void queryClient.invalidateQueries({ queryKey: qk.mediaItems.all });
    void queryClient.invalidateQueries({ queryKey: qk.activity.all });
    toast({
      title: `Removed ${removed} ${removed === 1 ? "video" : "videos"}`,
      description: "Their files were already gone. Nothing on disk changed.",
    });
  }

  function fail(problem: Error) {
    if (problem instanceof PrivacyLockedError) {
      onLocked?.();
      return;
    }
    toast({
      title: "Could not remove",
      description: problem.message,
      variant: "error",
    });
  }

  const removeSelected = useMutation({
    mutationFn: () => forgetMissing([...selected]),
    onSuccess: (result) => settle(result.removed),
    onError: fail,
  });

  const removeAll = useMutation({
    mutationFn: forgetAllMissing,
    onSuccess: (result) => settle(result.removed),
    onError: fail,
  });

  const busy = removeSelected.isPending || removeAll.isPending;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${tileWidth}px), 1fr))`,
          columnGap: layout.columnGapPx,
          rowGap: layout.rowGapPx,
        }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="skeleton rounded-md"
            style={{ aspectRatio: layout.aspectRatio }}
          />
        ))}
      </div>
    );
  }

  if (isError) {
    if (error instanceof PrivacyLockedError) {
      return (
        <div className="rounded-md border border-border bg-card/60 px-4 py-3 text-sm">
          <p className="text-muted-foreground">
            The unlock expired. Reload the page to enter it again.
          </p>
        </div>
      );
    }
    return (
      <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Could not load the missing list.
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card/40 p-8 text-center">
        <FileQuestion className="mx-auto size-6 text-muted-foreground" />
        <h2 className="mt-3 font-semibold tracking-tight">Nothing is missing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every video in the library is where it should be.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="font-semibold tracking-tight">
          {items.length} missing {items.length === 1 ? "video" : "videos"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Their files are gone from disk. Removing one forgets the library's
          record of it — the artwork below is the cached poster, and nothing on
          disk is touched.
        </p>
      </div>

      {/* Sticks to the top so the actions stay reachable however far down the
          grid you have scrolled picking things out. */}
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 bg-background/90 px-1 py-2 backdrop-blur">
        <button
          type="button"
          onClick={() =>
            setSelected((prev) =>
              prev.size === items.length
                ? new Set()
                : new Set(items.map((i) => i.id)),
            )
          }
          disabled={busy}
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {selected.size === items.length ? "Clear selection" : "Select all"}
        </button>

        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => removeSelected.mutate()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md bg-destructive/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-destructive disabled:opacity-50"
            >
              {removeSelected.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              Remove {selected.size} selected
            </button>
          )}

          {/* Deliberately two presses. Clearing the whole list is the one
              action here that cannot be walked back, and it should not share a
              single click with the ordinary case. */}
          {confirmingAll ? (
            <>
              <span className="text-xs text-muted-foreground">
                Remove all {items.length}?
              </span>
              <button
                type="button"
                onClick={() => removeAll.mutate()}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md bg-destructive/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-destructive disabled:opacity-50"
              >
                {removeAll.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <TriangleAlert className="size-3.5" />
                )}
                Yes, remove all
              </button>
              <button
                type="button"
                onClick={() => setConfirmingAll(false)}
                disabled={busy}
                className="rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingAll(true)}
              disabled={busy}
              className="rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent disabled:opacity-50"
            >
              Remove all {items.length}
            </button>
          )}
        </div>
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${tileWidth}px), 1fr))`,
          columnGap: layout.columnGapPx,
          rowGap: layout.rowGapPx,
        }}
      >
        {items.map((item) => (
          <MissingCard
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            onToggle={() => toggle(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

function MissingCard({
  item,
  selected,
  onToggle,
}: {
  item: MissingVideo;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-1.5">
      {/* `selectable` makes the whole tile a checkbox rather than a link, which
          is the only interaction that makes sense here — there is no file left
          to open. It also draws the app's own "missing" badge for free. */}
      <MediaCard
        item={item}
        selectable
        selected={selected}
        onClick={onToggle}
      />
      <p
        className="truncate px-0.5 text-[11px] text-muted-foreground"
        title={item.path ?? undefined}
      >
        {item.path ?? "No file path on record"}
      </p>
      <p className="px-0.5 text-[11px] text-muted-foreground/70">
        Missing since {formatDate(item.missingSince)}
        {item.sizeBytes !== null && ` · ${formatBytes(item.sizeBytes)}`}
      </p>
    </div>
  );
}
