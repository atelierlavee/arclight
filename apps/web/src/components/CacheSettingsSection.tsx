import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDrive, Trash2 } from "lucide-react";
import { formatBytes } from "@/lib/statsApi";
import { useToast } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";
import { qk } from "@/lib/queryKeys";

type CacheEntry = {
  name: string;
  kind: "upload" | "derived";
  files: number;
  bytes: number;
};

type CacheUsage = {
  entries: CacheEntry[];
  derivedBytes: number;
  uploadBytes: number;
};

const LABELS: Record<string, string> = {
  posters: "Posters",
  previews: "Hover previews",
  "scrub-sprites": "Seek-bar previews",
  thumbnails: "Thumbnails",
  "performer-images": "Performer images",
  "item-thumbnails": "Custom thumbnails",
  "kind-covers": "Category covers",
};

async function fetchCache(): Promise<CacheUsage> {
  const res = await fetch("/api/library/cache");
  if (!res.ok) throw new Error(`Failed to load cache usage: ${res.status}`);
  return res.json();
}

async function clearCache(names?: string[]): Promise<{ removed: number }> {
  const res = await fetch("/api/library/cache/clear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(names ? { names } : {}),
  });
  if (!res.ok) throw new Error(`Failed to clear cache: ${res.status}`);
  return res.json();
}

/**
 * The cache dashboard (§17).
 *
 * The two halves are separated visually because the distinction is the whole
 * point of the page: one can be deleted and rebuilt, and the other cannot be
 * got back. A single "cache size" figure with one button under it is how
 * someone deletes the artwork they uploaded while trying to free disk space.
 *
 * Only the regenerable half has a Clear button. The persistent half is shown
 * so its size is accounted for — otherwise the numbers here would not add up
 * to what the folder actually costs — and is read-only here by design.
 */
export function CacheSettingsSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: qk.cacheUsage,
    queryFn: fetchCache,
  });

  const clear = useMutation({
    mutationFn: (names?: string[]) => clearCache(names),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: qk.cacheUsage });
      toast({
        title:
          result.removed === 0
            ? "Nothing to clear"
            : `Cleared ${result.removed.toLocaleString()} files`,
        description:
          result.removed === 0
            ? "That artwork had not been generated yet."
            : "The next scan rebuilds them. Your originals and uploads are untouched.",
        variant: "success",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not clear the cache",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "error",
      });
    },
  });

  const derived = data?.entries.filter((entry) => entry.kind === "derived") ?? [];
  const uploads = data?.entries.filter((entry) => entry.kind === "upload") ?? [];

  return (
    <SettingsSection
      title="Cache"
      description="Artwork this server generates, and artwork you supplied."
    >
      {isLoading ? (
        <div className="space-y-2">
          <div className="skeleton h-4 w-40 rounded" />
          <div className="skeleton h-20 w-full rounded" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium">Regenerable</h3>
              <span className="text-xs text-muted-foreground">
                {formatBytes(data?.derivedBytes ?? 0)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Rebuilt from your videos on the next scan. Safe to delete; it
              costs processing time, not data.
            </p>

            <ul className="space-y-1">
              {derived.map((entry) => (
                <li
                  key={entry.name}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <HardDrive className="size-3.5 text-muted-foreground" />
                    {LABELS[entry.name] ?? entry.name}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {entry.files.toLocaleString()} files ·{" "}
                      {formatBytes(entry.bytes)}
                    </span>
                    <button
                      type="button"
                      disabled={clear.isPending || entry.files === 0}
                      onClick={() => clear.mutate([entry.name])}
                      className="rounded border border-border px-2 py-0.5 transition-colors hover:bg-accent disabled:opacity-40"
                    >
                      Clear
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              disabled={clear.isPending || (data?.derivedBytes ?? 0) === 0}
              onClick={() => clear.mutate(undefined)}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
              {clear.isPending ? "Clearing…" : "Clear all generated artwork"}
            </button>
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium">Persistent</h3>
              <span className="text-xs text-muted-foreground">
                {formatBytes(data?.uploadBytes ?? 0)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Images you uploaded. Nothing can rebuild these, so nothing here
              clears them — they go in every backup instead.
            </p>

            <ul className="space-y-1">
              {uploads.map((entry) => (
                <li
                  key={entry.name}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <HardDrive className="size-3.5 text-muted-foreground" />
                    {LABELS[entry.name] ?? entry.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.files.toLocaleString()} files ·{" "}
                    {formatBytes(entry.bytes)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
