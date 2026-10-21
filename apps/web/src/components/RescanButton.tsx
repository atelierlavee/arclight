import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { fetchScanJob, invalidateAfterScan, startScan } from "@/lib/scanApi";

export function RescanButton() {
  const [jobId, setJobId] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [background, setBackground] = useState(false);
  const queryClient = useQueryClient();

  const startMutation = useMutation({
    mutationFn: startScan,
    onSuccess: (data) => {
      setLastError(null);
      setJobId(data.id);
      setBackground(false);
    },
  });

  const { data: job } = useQuery({
    queryKey: ["scan-job", jobId],
    queryFn: () => fetchScanJob(jobId!),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") {
        return false;
      }
      return 1000;
    },
  });

  // Runs once when a tracked job finishes, as a proper effect rather than a
  // side effect during render (which would risk double-firing under
  // StrictMode's double-invoked renders).
  useEffect(() => {
    if (jobId === null || !job) return;
    if (job.status === "completed" || job.status === "failed") {
      invalidateAfterScan(queryClient);
      if (job.status === "failed") setLastError(job.error);
    }
  }, [job, jobId, queryClient]);

  const isRunning = job?.status === "running" || startMutation.isPending;

  if (isRunning && background) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Import running in background
        <button
          type="button"
          onClick={() => setBackground(false)}
          className="text-foreground underline-offset-2 hover:underline"
        >
          Show progress
        </button>
      </div>
    );
  }

  if (isRunning && job) {
    const percent = job.filesTotal
      ? Math.min(100, Math.round((job.filesScanned / job.filesTotal) * 100))
      : null;
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card/60 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Loader2 className="size-4 animate-spin" /> Scanning library
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {job.filesTotal
                ? `${job.filesScanned.toLocaleString()} / ${job.filesTotal.toLocaleString()} files`
                : `${job.filesScanned.toLocaleString()} files scanned`}
            </p>
          </div>
          {percent !== null && (
            <span className="text-xl font-semibold tabular-nums">
              {percent}%
            </span>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className={
              percent === null
                ? "h-full w-1/2 animate-pulse rounded-full bg-foreground"
                : "h-full rounded-full bg-foreground transition-[width]"
            }
            style={percent === null ? undefined : { width: `${percent}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            New files and artwork are processed as they are found.
          </span>
          <button
            type="button"
            onClick={() => setBackground(true)}
            className="shrink-0 rounded-md bg-secondary px-2.5 py-1.5 text-xs transition-colors hover:bg-accent"
          >
            Run in background
          </button>
        </div>
      </div>
    );
  }

  if (job?.status === "completed") {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-500">
        <CheckCircle2 className="size-4" /> Library scan complete{" "}
        <button
          type="button"
          onClick={() => setJobId(null)}
          className="ml-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (job?.status === "failed" || lastError) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <XCircle className="size-4" /> Scan failed: {lastError ?? job?.error}{" "}
        <button
          type="button"
          onClick={() => {
            setJobId(null);
            setLastError(null);
          }}
          className="ml-2 text-xs underline"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => startMutation.mutate()}
      disabled={startMutation.isPending}
      className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
    >
      {startMutation.isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <RefreshCw className="size-4" />
      )}
      Import library
    </button>
  );
}
