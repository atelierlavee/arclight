import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, FolderOpen } from "lucide-react";
import { SettingsSection } from "./SettingsSection";
import { formatBytes } from "@/lib/statsApi";
import { qk } from "@/lib/queryKeys";

type DuplicateFile = {
  mediaItemId: number;
  title: string;
  path: string;
  sizeBytes: number;
  discoveredAt: string;
};

type DuplicateGroup = { contentHash: string; files: DuplicateFile[] };

async function fetchDuplicates(): Promise<{
  groups: DuplicateGroup[];
  reclaimableBytes: number;
}> {
  const res = await fetch("/api/library/duplicates");
  if (!res.ok) throw new Error(`Failed to load duplicates: ${res.status}`);
  return res.json();
}

/**
 * The duplicate groups behind the count on the health dashboard (§16).
 *
 * Matched on content hash, so it finds the same footage stored twice under
 * two different names — which is the case a filename comparison cannot see
 * and the only one worth reporting.
 *
 * There is no delete button, and that is deliberate rather than unfinished.
 * §16 says duplicates are a recommendation and never an automatic deletion,
 * and §29 that originals are read-only to this application. Showing the paths
 * and the sizes is the whole of what it can safely offer; the file manager is
 * where a deletion belongs, with the person who knows which copy is the one
 * on the backup drive.
 */
export function DuplicatesSection() {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: qk.duplicates,
    queryFn: fetchDuplicates,
    // Hashing every file is the scanner's job; this only reads the result,
    // but it is still a full table scan and nobody needs it on page load.
    enabled: expanded,
  });

  return (
    <SettingsSection
      title="Duplicates"
      description="Files with identical content, found by hash rather than by name."
    >
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
        >
          <Copy className="size-3.5" /> Check for duplicates
        </button>
      ) : isLoading ? (
        <div className="space-y-2">
          <div className="skeleton h-4 w-48 rounded" />
          <div className="skeleton h-16 w-full rounded" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">
          Could not read the duplicate list. Your files are untouched — this
          view only reads.
        </p>
      ) : data && data.groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No duplicates. Every scanned video has unique content.
        </p>
      ) : (
        data && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {data.groups.length}{" "}
              {data.groups.length === 1 ? "group" : "groups"}, holding{" "}
              <span className="font-medium text-foreground">
                {formatBytes(data.reclaimableBytes)}
              </span>{" "}
              in redundant copies.
            </p>

            <p className="text-xs text-muted-foreground/80">
              Nothing here deletes anything. Remove the copies you don&rsquo;t
              want in your file manager, then run a scan.
            </p>

            <ul className="space-y-2">
              {data.groups.map((group) => (
                <li
                  key={group.contentHash}
                  className="space-y-1.5 rounded-md border border-border p-2.5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate font-mono">
                      {group.contentHash.slice(0, 16)}…
                    </span>
                    <span className="shrink-0">
                      {group.files.length} copies
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {group.files.map((file) => (
                      <li
                        key={file.path}
                        className="flex items-baseline justify-between gap-3 text-xs"
                      >
                        <span className="flex min-w-0 items-baseline gap-1.5">
                          <FolderOpen className="size-3 shrink-0 self-center text-muted-foreground" />
                          {/* Not `sensitive`: a path is what identifies the
                              copy to delete, and blurring it would make the
                              list useless for its one purpose. The section
                              lives behind Settings for that reason. */}
                          <span className="truncate font-mono">
                            {file.path}
                          </span>
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {formatBytes(file.sizeBytes)}
                          {" · "}
                          {new Date(file.discoveredAt).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </SettingsSection>
  );
}
