import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2, TriangleAlert } from "lucide-react";
import { SettingsSection } from "./SettingsSection";
import { useToast } from "@/lib/toast";
import { withPrivacyUnlock } from "@/lib/privacyLock";
import { libraryStatsKey } from "@/lib/statsApi";
import {
  cleanupQueryKey,
  fetchRemovableData,
  purgeRemovableData,
  type RemovableData,
} from "@/lib/libraryApi";

/** The counts worth naming, in the order they matter. */
function summarise(data: RemovableData): string[] {
  const parts: string[] = [];
  const add = (n: number, one: string, many = `${one}s`) => {
    if (n > 0) parts.push(`${n.toLocaleString()} ${n === 1 ? one : many}`);
  };
  add(data.videos, "video");
  add(data.photos, "photo");
  add(data.performers, "performer");
  add(data.studios, "studio");
  add(data.albums, "album");
  add(data.series, "series", "series");
  return parts;
}

/**
 * Clears what a removed folder left behind.
 *
 * Removing a scan folder hides its items rather than deleting them, so that
 * adding the folder back restores everything. The cost is that its performers
 * and studios stay in the lists — a library you no longer have, still named
 * everywhere. This is how you say you meant it.
 */
export function LibraryCleanupSection() {
  const { data, isLoading } = useQuery({
    queryKey: cleanupQueryKey,
    queryFn: fetchRemovableData,
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);

  const purge = useMutation({
    // Guarded server-side; an expired unlock asks again and retries.
    mutationFn: () => withPrivacyUnlock(purgeRemovableData),
    onSuccess: (removed) => {
      setConfirming(false);
      for (const key of [
        cleanupQueryKey,
        libraryStatsKey,
        ["media-items"],
        ["performers"],
        ["studios"],
        ["albums"],
        ["series"],
        ["tags"],
        ["activity"],
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      toast({
        title:
          removed.items > 0
            ? `Removed ${removed.items.toLocaleString()} items`
            : "Cleaned up",
        description: "Your files were not touched — only what the library remembered about them.",
      });
    },
    onError: (error) =>
      toast({
        title: "Could not clean up",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "error",
      }),
  });

  if (isLoading) return <div className="skeleton h-32 rounded-lg" />;

  // Nothing to say when there is nothing to clear — a panel offering to
  // delete zero things is just another thing to read.
  //
  // Every count, not just the items: a cleanup that removed the items but
  // stopped before their performers left the panel hiding itself with the
  // job half done and no way back to it.
  const total =
    data &&
    data.items +
      data.performers +
      data.studios +
      data.albums +
      data.series;
  if (!data || !total) return null;

  const parts = summarise(data);

  return (
    <SettingsSection
      title="Left over from removed folders"
      description="Folders you stop watching keep their data, so adding one back restores it. These belong to folders that are gone."
    >
      <div className="flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <div className="min-w-0 text-sm">
          <p className="font-medium">
            {data.items > 0
              ? `${data.items.toLocaleString()} items are still stored`
              : "Some details are still stored"}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            {parts.join(" · ")}
          </p>
        </div>
      </div>

      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Permanently remove these? Your media files are not touched.
          </span>
          <button
            type="button"
            onClick={() => purge.mutate()}
            disabled={purge.isPending}
            className="flex items-center gap-1.5 rounded-md bg-destructive/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-destructive disabled:opacity-50"
          >
            {purge.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            Yes, remove them
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={purge.isPending}
            className="rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="self-start rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
        >
          Clean up
        </button>
      )}
    </SettingsSection>
  );
}
