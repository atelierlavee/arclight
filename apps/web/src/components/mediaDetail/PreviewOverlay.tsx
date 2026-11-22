import {
  Clock,
  Eye,
  EyeOff,
  Heart,
  LayoutGrid,
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
  onToggleWatchLater,
  onOpenContactSheet,
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
  onToggleWatchLater: (next: boolean) => void;
  onOpenContactSheet: () => void;
  onQueue: (next: boolean) => void;
  onSetHallOfFamePin: (id: number) => void;
  onToggleMuted: () => void;
}) {
  return (
    <>
      {/* Darkness pooled at the bottom and left, where the words sit, as on
          the home page's opening shot. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/70 via-black/20 to-transparent" />

      <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-3 p-4 sm:gap-5 sm:p-8 md:p-12">
        <p className="hidden text-xs font-semibold uppercase tracking-[0.3em] text-primary sm:block">Now showing</p>
        <h2 className="sensitive line-clamp-2 max-w-4xl pr-12 text-2xl font-black leading-[1.05] tracking-tight drop-shadow-md sm:pr-0 sm:text-4xl md:text-6xl">
          {item?.title ?? "Loading…"}
        </h2>
        {item && (
          <p className="sensitive text-[11px] uppercase tracking-[0.25em] text-white/75 sm:text-xs">
            {[
              item.performers
                ?.slice(0, 3)
                .map((performer) => performer.name)
                .join(", "),
              item.studio,
              item.releaseDate?.slice(0, 4),
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
        )}

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
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-4 py-1.5 text-xs font-bold text-black transition-transform hover:scale-[1.03] sm:gap-2 sm:px-6 sm:py-2.5 sm:text-sm"
            >
              <RotateCcw className="size-4 sm:size-5" />
              Start Over
            </button>
            {canResume && (
              <button
                type="button"
                onClick={() => onStartPlaying(item.lastPositionSeconds)}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-white shadow-[0_0_24px_-6px_rgba(255,45,149,0.8)] transition-transform hover:scale-[1.03] sm:gap-2 sm:px-6 sm:py-2.5 sm:text-sm"
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
                  item.isFavorite && "fill-primary text-primary",
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
              onClick={() => onToggleWatchLater(!item.watchLaterAt)}
              aria-pressed={Boolean(item.watchLaterAt)}
              aria-label={
                item.watchLaterAt ? "Remove from Watch Later" : "Save to Watch Later"
              }
              title={
                item.watchLaterAt
                  ? "On Watch Later — click to remove"
                  : "Save to Watch Later"
              }
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/40 backdrop-blur-sm transition-colors hover:border-white sm:size-10"
            >
              <Clock
                className={cn(
                  "size-4 transition-colors sm:size-5",
                  item.watchLaterAt && "text-sky-400",
                )}
              />
            </button>
            <button
              type="button"
              onClick={onOpenContactSheet}
              aria-label="Contact sheet"
              title="Contact sheet (g)"
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/40 backdrop-blur-sm transition-colors hover:border-white sm:size-10"
            >
              <LayoutGrid className="size-4 sm:size-5" />
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
