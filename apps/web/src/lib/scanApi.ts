import type { QueryClient } from "@tanstack/react-query";
import { qk } from "./queryKeys";
import { invalidateKeys } from "./invalidate";

export type ScanJob = {
  id: number;
  status: "running" | "completed" | "failed";
  filesScanned: number;
  filesTotal: number | null;
  error: string | null;
};

export async function startScan(): Promise<{ id: number }> {
  const res = await fetch("/api/scan", { method: "POST" });
  if (!res.ok) {
    throw new Error(`Failed to start scan: ${res.status}`);
  }
  return res.json();
}

export async function fetchScanJob(id: number): Promise<ScanJob> {
  const res = await fetch(`/api/scan/${id}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch scan status: ${res.status}`);
  }
  return res.json();
}

/**
 * Everything a finished scan can change.
 *
 * A scan can add items, reassign performers and studios, assign albums and
 * series, and change every count — invalidating only media-items left the
 * rest stale.
 *
 * Keys come from the shared factory rather than being spelled inline: an
 * inline key that no component actually queries under is invisibly dead,
 * which is exactly how the library stats went stale here until a page reload.
 */
export function invalidateAfterScan(queryClient: QueryClient): void {
  invalidateKeys(queryClient, [
    qk.mediaItems.all,
    qk.performers.all,
    qk.studios.all,
    qk.libraryStats,
    qk.albums.all,
    qk.series.all,
    qk.heroItems,
    qk.libraryRoots,
    qk.scanLatest,
  ]);
}

/**
 * Follows a scan started from somewhere with no progress UI of its own — the
 * command palette closes as soon as the command runs — and refreshes the
 * library once it ends, as the settings button does.
 */
export async function followScan(
  queryClient: QueryClient,
  id: number,
): Promise<ScanJob | null> {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    let job: ScanJob;
    try {
      job = await fetchScanJob(id);
    } catch {
      return null;
    }
    if (job.status !== "running") {
      invalidateAfterScan(queryClient);
      return job;
    }
  }
}
