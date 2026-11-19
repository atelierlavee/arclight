import { Armchair, SkipForward, Square } from "lucide-react";
import type { LeanBackSession } from "@/lib/leanBack";
import { cn } from "@/lib/utils";

/**
 * The one piece of chrome a lean-back session shows: what it is doing, how
 * many videos are left, and the two things you might want — skip, or stop.
 * Fades with the rest of the player controls.
 */
export function LeanBackBar({
  session,
  remaining,
  visible,
  onSkip,
  onStop,
}: {
  session: LeanBackSession;
  remaining: number;
  visible: boolean;
  onSkip: () => void;
  onStop: () => void;
}) {
  return (
    <div
      className={cn(
        "absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/70 py-1 pl-3 pr-1 text-xs text-white backdrop-blur-sm transition-opacity duration-300",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <Armchair className="size-3.5" />
      <span className="mr-1 whitespace-nowrap">
        Lean back
        {session.clipSeconds ? ` · ${Math.round(session.clipSeconds / 60)}-min clips` : ""}
        {` · ${remaining} left`}
      </span>
      <button
        type="button"
        onClick={onSkip}
        aria-label={remaining > 0 ? "Skip to the next video" : "End lean back"}
        title={remaining > 0 ? "Next video" : "End lean back"}
        className="flex size-7 items-center justify-center rounded-full transition-colors hover:bg-white/20"
      >
        <SkipForward className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onStop}
        aria-label="Stop lean back"
        title="Stop lean back — the video keeps playing"
        className="flex size-7 items-center justify-center rounded-full transition-colors hover:bg-white/20"
      >
        <Square className="size-3 fill-current" />
      </button>
    </div>
  );
}
