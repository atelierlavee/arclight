import { Loader2 } from "lucide-react";
import { EditDialog } from "./EditDialog";
import { useMarkerMutations, useTpdbMatch } from "@/lib/markerApi";
import { formatDuration } from "@/lib/utils";
import { useToast } from "@/lib/toast";

/**
 * Pick the ThePornDB scene a video is, and take its position markers.
 *
 * The search is built from the video's own studio, release date and title.
 * When exactly one scene from that studio was released that day it is put
 * first and marked; anything else is a list to choose from. Nothing is saved
 * until a scene is chosen, and choosing replaces only markers fetched before
 * — hand-made ones stay.
 */
export function TpdbMarkersDialog({ itemId, onClose }: { itemId: number; onClose: () => void }) {
  const match = useTpdbMatch(itemId, true);
  const { applyTpdb } = useMarkerMutations(itemId);
  const { toast } = useToast();

  const candidates = match.data
    ? [...match.data.candidates].sort(
        (a, b) => Number(b.id === match.data.confidentId) - Number(a.id === match.data.confidentId),
      )
    : [];

  function choose(sceneId: string) {
    applyTpdb.mutate(sceneId, {
      onSuccess: ({ count }) => {
        toast({
          title: count > 0 ? `${count} positions added` : "No positions on ThePornDB yet",
          description:
            count > 0 ? undefined : "The scene is matched; a later library fetch won't ask again.",
          variant: count > 0 ? "success" : "info",
        });
        onClose();
      },
      onError: (error) => toast({ title: "Couldn't fetch positions", description: error.message, variant: "error" }),
    });
  }

  const query = match.data?.query;

  return (
    <EditDialog title="Positions from ThePornDB" onClose={onClose}>
      <div className="space-y-3">
        {query && (
          <p className="text-xs text-muted-foreground">
            Searched for {[query.studio, query.date, query.title].filter(Boolean).join(" · ")}
            {(!query.studio || !query.date) &&
              ". Without a studio and release date there's no sure match — pick the right scene."}
          </p>
        )}
        {match.isLoading ? (
          <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
        ) : match.error ? (
          <p className="text-xs text-destructive">{match.error.message}</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing on ThePornDB matches this video. Check its studio, date and title.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {candidates.map((candidate) => {
              const sure = candidate.id === match.data?.confidentId;
              return (
                <li key={candidate.id}>
                  <button
                    type="button"
                    disabled={applyTpdb.isPending}
                    onClick={() => choose(candidate.id)}
                    className="flex w-full items-center gap-3 rounded-md border border-border p-2 text-left transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    {candidate.image && (
                      <img
                        src={candidate.image}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="sensitive h-12 w-20 shrink-0 rounded object-cover"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {candidate.title}
                        {sure && (
                          <span className="ml-2 rounded bg-emerald-500/15 px-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            Match
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[
                          candidate.studio,
                          candidate.date,
                          candidate.durationSeconds ? formatDuration(candidate.durationSeconds) : null,
                          candidate.performers.join(", "),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {applyTpdb.isPending && applyTpdb.variables === candidate.id && (
                      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </EditDialog>
  );
}
