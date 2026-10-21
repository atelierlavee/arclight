import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { useToast } from "@/lib/toast";
import { qk } from "@/lib/queryKeys";

/**
 * Empties the Continue Watching row.
 *
 * Asks first, inline rather than through a browser dialog: the row is built
 * from real viewing and there is no undo, so a single misplaced click should
 * not wipe every resume point. It only clears where you got to — play counts
 * and finished videos are untouched.
 */
export function ClearContinueWatching() {
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const clear = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/continue-watching", { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to clear: ${res.status}`);
      return res.json() as Promise<{ cleared: number }>;
    },
    onSuccess: ({ cleared }) => {
      setConfirming(false);
      queryClient.invalidateQueries({ queryKey: qk.continueWatching });
      // Resume positions show on the tiles as a progress bar, and on a
      // performer's profile as its own strip.
      queryClient.invalidateQueries({ queryKey: qk.mediaItems.all });
      queryClient.invalidateQueries({ queryKey: qk.performerInProgress.all });
      // The row empties itself, which shows that *something* happened but not
      // how much. The server counts the rows it removed, so say so.
      toast({
        title: "Continue Watching cleared",
        description: `${cleared} resume point${cleared === 1 ? "" : "s"} removed. Play counts and watched state are untouched.`,
        variant: "success",
      });
    },
    onError: (error) => {
      toast({
        title: "Could not clear Continue Watching",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "error",
      });
    },
  });

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        Clear
      </button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-2 text-xs">
      <span className="text-muted-foreground">Clear all?</span>
      <button
        type="button"
        onClick={() => clear.mutate()}
        disabled={clear.isPending}
        className="flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 font-medium text-black transition-transform hover:scale-[1.03] disabled:opacity-50"
      >
        {clear.isPending && <Loader2 className="size-3 animate-spin" />}
        Yes
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        aria-label="Cancel"
        className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}
