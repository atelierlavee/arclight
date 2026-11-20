import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Shapes } from "lucide-react";
import { useStartFetchAll, useTpdbStatus } from "@/lib/markerApi";
import { useIsOwner } from "@/lib/profile";
import { qk } from "@/lib/queryKeys";

/**
 * Fetch positions from ThePornDB for the whole library.
 *
 * Asks about every video with a studio and a release date that has not been
 * looked up yet, takes only sure matches, and runs one video a second in the
 * background. Running it again only asks about videos added since.
 */
export function TpdbFetchSection() {
  const isOwner = useIsOwner();
  const status = useTpdbStatus(isOwner);
  const start = useStartFetchAll();
  const queryClient = useQueryClient();
  const run = status.data?.fetchAll;

  // When a run ends, every open seek bar and the Positions page are stale.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && run && !run.running) {
      void queryClient.invalidateQueries({ queryKey: qk.allMarkers });
      void queryClient.invalidateQueries({ queryKey: qk.positions.all });
    }
    wasRunning.current = run?.running ?? false;
  }, [run, queryClient]);

  if (!isOwner) return null;

  return (
    <section
      className="space-y-3 rounded-lg border border-border bg-card/60 p-5"
      aria-labelledby="tpdb-fetch-title"
    >
      <div className="flex items-center gap-2">
        <Shapes className="size-4 text-muted-foreground" />
        <h2 id="tpdb-fetch-title" className="text-base font-semibold">
          Positions from ThePornDB
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Looks up each video by its studio, release date and title, and adds the named positions
        ThePornDB has for it to the seek bar. Only sure matches are taken; videos without a studio
        and date are skipped. Nothing else about your videos is changed.
      </p>

      {status.data && !status.data.configured ? (
        <p className="text-sm text-muted-foreground">
          Set <code className="rounded bg-muted px-1 font-mono text-xs">TPDB_API_KEY</code> on the
          server to turn this on.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!status.data || run?.running || start.isPending}
            onClick={() => start.mutate()}
            className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {run?.running && <Loader2 className="size-3.5 animate-spin" />}
            {run?.running ? "Fetching…" : "Fetch positions"}
          </button>
          {run && (run.running || run.finishedAt) && (
            <span className="text-sm tabular-nums text-muted-foreground">
              {run.running ? `${run.checked} of ${run.total} checked` : `${run.checked} checked`} ·{" "}
              {run.matched} matched · {run.markers.toLocaleString()} positions
              {run.failed > 0 && ` · ${run.failed} failed`}
            </span>
          )}
          {run && !run.running && run.finishedAt && run.total === 0 && (
            <span className="text-sm text-muted-foreground">Every video has been checked already.</span>
          )}
          {(run?.error || start.error) && (
            <p className="w-full text-sm text-destructive">{run?.error ?? start.error?.message}</p>
          )}
        </div>
      )}
    </section>
  );
}
