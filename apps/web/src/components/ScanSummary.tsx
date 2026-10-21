import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileClock } from "lucide-react";
import { qk } from "@/lib/queryKeys";

type ScanJob = {
  id: number;
  status: string;
  finishedAt: string | null;
  itemsNew: number;
  itemsUpdated: number;
  itemsMoved: number;
  itemsMissing: number;
  itemsSkipped: number;
};

async function fetchLatestScan(): Promise<{ job: ScanJob | null }> {
  const res = await fetch("/api/scan/latest");
  if (!res.ok) throw new Error(`Failed to load scan: ${res.status}`);
  return res.json();
}

/**
 * "+24 New | 8 Updated | 5 Moved | 2 Missing" (§15).
 *
 * Counted by the scanner as it goes rather than derived from a before/after
 * diff, because a diff cannot tell a move from a delete plus an add — and the
 * move case is the one the incremental scanner exists to get right.
 *
 * The zeroes are dropped from the line but "Unchanged" is always shown, so a
 * scan that found nothing new reads as "I looked at 1,204 files and they were
 * all already here" rather than as an empty box that might mean failure.
 */
export function ScanSummary() {
  const { data } = useQuery({
    queryKey: qk.scanLatest,
    queryFn: fetchLatestScan,
  });

  const job = data?.job;
  if (!job || job.status !== "completed") return null;

  const changes = [
    { label: "New", value: job.itemsNew },
    { label: "Updated", value: job.itemsUpdated },
    { label: "Moved", value: job.itemsMoved },
    { label: "Missing", value: job.itemsMissing },
  ].filter((entry) => entry.value > 0);

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <FileClock className="size-4 shrink-0 text-muted-foreground" />
        {changes.length === 0 ? (
          <span className="text-muted-foreground">
            Nothing changed in the last scan.
          </span>
        ) : (
          changes.map((entry) => (
            <span key={entry.label} className="flex items-center gap-1.5">
              <span className="font-semibold">{entry.value}</span>
              <span className="text-muted-foreground">{entry.label}</span>
            </span>
          ))
        )}
        <span className="text-xs text-muted-foreground/70">
          {job.itemsSkipped.toLocaleString()} unchanged
        </span>
      </div>

      {/* "View Changes" (§15). Each links at the view that actually answers
          the number beside it, rather than one generic report page that would
          have to duplicate three views that already exist. */}
      {changes.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs">
          {job.itemsNew > 0 && (
            <Link
              to="/browse"
              search={{ sort: "newest" }}
              className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              See what&rsquo;s new
            </Link>
          )}
          {job.itemsMissing > 0 && (
            <Link
              to="/missing"
              className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Review missing files
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
