import {
  Eye,
  EyeOff,
  Heart,
  ListPlus,
  Play,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { MediaItemDetail } from "@/lib/mediaItemApi";
import { cn } from "@/lib/utils";

/**
 * The title and actions laid over the muted preview on a wide screen, with
 * the mute button in its corner.
 */
export function PreviewOverlay({
  item,
  canResume,
  muted,
  watchedPending,
  hallOfFamePin,
  onStartPlaying,
  onToggleFavorite,
  onToggleWatched,
  onQueue,
  onSetHallOfFamePin,
  onToggleMuted,
}: {
  item: MediaItemDetail | undefined;
  canResume: boolean;
  muted: boolean;
  watchedPending: boolean;
  hallOfFamePin: number;
  onStartPlaying: (positionSeconds: number) => void;
  onToggleFavorite: (next: boolean) => void;
  onToggleWatched: (next: boolean) => void;
  onQueue: (next: boolean) => void;
  onSetHallOfFamePin: (id: number) => void;
  onToggleMuted: () => void;
}) {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />

      <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-2 p-3 sm:gap-4 sm:p-6">
        <h2 className="sensitive line-clamp-2 max-w-2xl pr-12 text-base font-bold tracking-tight drop-shadow-md sm:pr-0 sm:text-2xl md:text-3xl">
          {item?.title ?? "Loading…"}
        </h2>

        {item?.itemType === "video" && (
          <div
            // Wraps, and every control keeps its size: unwrapped,
            // six of them in a phone's width squeezed the round
            // buttons into each other. The right padding is the
            // lane the mute button sits in, further down.
            className="flex flex-wrap items-center gap-1.5 sm:gap-3"
          >
            <button
              type="button"
              onClick={() => onStartPlaying(0)}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-black transition-transform hover:scale-[1.03] sm:gap-2 sm:px-5 sm:py-2 sm:text-base"
            >
              <RotateCcw className="size-4 sm:size-5" />
              Start Over
            </button>
            {canResume && (
              <button
                type="button"
                onClick={() => onStartPlaying(item.lastPositionSeconds)}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-white/20 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm transition-colors hover:bg-white/30 sm:gap-2 sm:px-5 sm:py-2 sm:text-base"
              >
                <Play className="size-4 fill-current sm:size-5" />
                {/* Shortened on a phone so it shares a line with
                    "Start Over" instead of stacking under it. */}
                <span className="sm:hidden">Resume</span>
                <span className="hidden sm:inline">
                  Continue Watching
                </span>
              </button>
            )}
            {/* Its own line on a phone, so the two labelled
                buttons keep theirs. The right padding is the lane
                the mute button sits in, at the corner below. */}
            <div className="flex w-full items-center gap-1.5 pr-10 sm:w-auto sm:gap-3 sm:pr-0">
            <button
              type="button"
              onClick={() => onToggleFavorite(!item.isFavorite)}
              aria-pressed={item.isFavorite}
              aria-label={
                item.isFavorite
                  ? "Remove from favourites"
                  : "Mark as favourite"
              }
              title={
                item.isFavorite ? "Favourited" : "Mark as favourite"
              }
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/40 backdrop-blur-sm transition-colors hover:border-white disabled:opacity-50 sm:size-10"
            >
              <Heart
                className={cn(
                  "size-4 transition-colors sm:size-5",
                  item.isFavorite && "fill-red-500 text-red-500",
                )}
              />
            </button>
            <button
              type="button"
              onClick={() => onToggleWatched(!item.watched)}
              disabled={watchedPending}
              aria-pressed={item.watched}
              aria-label={
                item.watched ? "Mark as unwatched" : "Mark as watched"
              }
              title={
                item.watched
                  ? "Watched — click to unmark"
                  : "Mark as watched"
              }
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/40 backdrop-blur-sm transition-colors hover:border-white disabled:opacity-50 sm:size-10"
            >
              {item.watched ? (
                <Eye className="size-4 text-emerald-400 sm:size-5" />
              ) : (
                <EyeOff className="size-4 sm:size-5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onQueue(false)}
              aria-label="Add to queue"
              title="Add to queue"
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/40 backdrop-blur-sm transition-colors hover:border-white sm:size-10"
            >
              <ListPlus className="size-4 sm:size-5" />
            </button>
            {/* Makes this the Hall of fame's headline ("#1 of all time") on the
                Stats page, in place of the automatic pick. */}
            <button
              type="button"
              onClick={() =>
                onSetHallOfFamePin(hallOfFamePin === item.id ? 0 : item.id)
              }
              aria-pressed={hallOfFamePin === item.id}
              aria-label={
                hallOfFamePin === item.id
                  ? "Unpin from Hall of fame"
                  : "Pin to Hall of fame"
              }
              title={
                hallOfFamePin === item.id
                  ? "Your #1 of all time — click to unpin from Hall of fame"
                  : "Pin to Hall of fame as your #1 of all time"
              }
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/40 backdrop-blur-sm transition-colors hover:border-white sm:size-10"
            >
              <Trophy
                className={cn(
                  "size-4 transition-colors sm:size-5",
                  hallOfFamePin === item.id && "fill-amber-400 text-amber-400",
                )}
              />
            </button>
            <button
              type="button"
              onClick={() => onQueue(true)}
              aria-label="Play next"
              title="Play next"
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/40 backdrop-blur-sm transition-colors hover:border-white sm:size-10"
            >
              <ListPlus className="size-4 sm:size-5" />
            </button>
            </div>
          </div>
        )}
      </div>

      {item?.itemType === "video" && (
        <button
          type="button"
          onClick={onToggleMuted}
          aria-label={muted ? "Unmute" : "Mute"}
          className="absolute bottom-3 right-3 flex size-8 items-center justify-center rounded-full border border-white/40 bg-black/40 backdrop-blur-sm hover:bg-black/60 sm:bottom-6 sm:right-6 sm:size-10"
        >
          {muted ? (
            <VolumeX className="size-4" />
          ) : (
            <Volume2 className="size-4" />
          )}
        </button>
      )}
    </>
  );
}

/**
 * The phone's stand-in for the overlay: a single play button over the frame,
 * with everything else moved below it.
 */
export function MobilePlayButton({
  canResume,
  onPlay,
}: {
  canResume: boolean;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={canResume ? "Resume" : "Play"}
      title={canResume ? "Resume" : "Play"}
      className="absolute inset-0 z-20 flex items-center justify-center"
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/60 backdrop-blur-sm transition-transform active:scale-95">
        <Play className="size-7 translate-x-0.5 fill-current" />
      </span>
    </button>
  );
}
