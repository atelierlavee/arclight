import {
  Bookmark as BookmarkIcon,
  Cast,
  ChevronRight,
  FastForward,
  Gauge,
  Lightbulb,
  Maximize,
  MonitorPlay,
  PictureInPicture2,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { PLAYBACK_RATES, SKIP_OPTIONS } from "@/lib/playerPrefs";
import { cn } from "@/lib/utils";

/**
 * The row of buttons over the top-left of the frame during real playback.
 *
 * Sits above the native control bar rather than replacing it — the browser's
 * scrubber and fullscreen already work, these are only the pieces it doesn't
 * offer.
 */
export function PlayerControls({
  visible,
  mini,
  cinema,
  discreet,
  ambient,
  skipSeconds,
  rate,
  showRates,
  showSkipOptions,
  castAvailable,
  casting,
  pipSupported,
  hasNextQueued,
  onSkip,
  onToggleRates,
  onApplyRate,
  onToggleSkipOptions,
  onApplySkipSeconds,
  onBookmark,
  onCast,
  onTogglePictureInPicture,
  onToggleAmbient,
  onToggleFullscreen,
  onPlayNext,
  onToggleCinema,
}: {
  visible: boolean;
  mini: boolean;
  cinema: boolean;
  discreet: boolean;
  ambient: boolean;
  skipSeconds: number;
  rate: number;
  showRates: boolean;
  showSkipOptions: boolean;
  castAvailable: boolean;
  casting: boolean;
  pipSupported: boolean;
  hasNextQueued: boolean;
  onSkip: (seconds: number) => void;
  onToggleRates: () => void;
  onApplyRate: (rate: number) => void;
  onToggleSkipOptions: () => void;
  onApplySkipSeconds: (seconds: number) => void;
  onBookmark: () => void;
  onCast: () => void;
  onTogglePictureInPicture: () => void;
  onToggleAmbient: () => void;
  onToggleFullscreen: () => void;
  onPlayNext: () => void;
  onToggleCinema: () => void;
}) {
  return (
    <div
      className={cn(
        // The wrapper never takes a tap itself, only its buttons
        // do: wrapped onto two rows on a phone, its box covers the
        // top half of the frame, and the gaps between buttons are
        // where the double-tap-to-skip zones have to be reachable.
        "pointer-events-none absolute left-4 top-4 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 transition-opacity duration-300",
        visible
          ? "opacity-100 [&>*]:pointer-events-auto"
          : "opacity-0",
      )}
    >
      <button
        type="button"
        onClick={() => onSkip(-skipSeconds)}
        aria-label={`Back ${skipSeconds} seconds`}
        title={`Back ${skipSeconds}s (←)`}
        className="flex size-9 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-colors hover:bg-black/80"
      >
        <RotateCcw className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => onSkip(skipSeconds)}
        aria-label={`Forward ${skipSeconds} seconds`}
        title={`Forward ${skipSeconds}s (→)`}
        className="flex size-9 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-colors hover:bg-black/80"
      >
        <RotateCw className="size-4" />
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={onToggleRates}
          aria-label="Playback speed"
          aria-expanded={showRates}
          title="Playback speed"
          className="flex h-9 items-center gap-1.5 rounded-full bg-black/60 px-3 text-xs font-medium backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          <Gauge className="size-4" />
          {rate}×
        </button>
        {showRates && (
          <div className="absolute left-0 top-11 z-10 flex flex-col overflow-hidden rounded-md bg-black/90 py-1 backdrop-blur-sm">
            {PLAYBACK_RATES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onApplyRate(option)}
                className={cn(
                  "px-4 py-1.5 text-left text-xs transition-colors hover:bg-white/15",
                  option === rate && "font-semibold text-white",
                )}
              >
                {option}×
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={onToggleSkipOptions}
          aria-label="Skip interval"
          aria-expanded={showSkipOptions}
          title="Skip interval"
          className="flex h-9 items-center gap-1.5 rounded-full bg-black/60 px-3 text-xs font-medium backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          <FastForward className="size-4" />
          {skipSeconds}s
        </button>
        {showSkipOptions && (
          <div className="absolute left-0 top-11 z-10 flex flex-col overflow-hidden rounded-md bg-black/90 py-1 backdrop-blur-sm">
            {SKIP_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onApplySkipSeconds(option)}
                className={cn(
                  "px-4 py-1.5 text-left text-xs transition-colors hover:bg-white/15",
                  option === skipSeconds && "font-semibold text-white",
                )}
              >
                {option}s
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onBookmark}
        aria-label="Bookmark this moment"
        title="Bookmark this moment (b)"
        className="flex size-9 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-colors hover:bg-black/80"
      >
        <BookmarkIcon className="size-4" />
      </button>
      {/* Only once the browser has found a device to cast to, so a
          house with no TV on the network never sees it. */}
      {castAvailable && (
        <button
          type="button"
          onClick={onCast}
          aria-label={casting ? "Casting — choose a device" : "Cast to a TV"}
          title={casting ? "Casting" : "Cast to a TV"}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-full px-3 text-xs backdrop-blur-sm transition-colors",
            casting
              ? "bg-white text-black hover:bg-white/90"
              : "bg-black/60 hover:bg-black/80",
          )}
        >
          <Cast className="size-4" />
          {casting ? "Casting" : "Cast"}
        </button>
      )}
      {pipSupported && (
        <button
          type="button"
          onClick={onTogglePictureInPicture}
          aria-label="Picture in picture"
          title="Picture in picture (i)"
          className="flex size-9 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          <PictureInPicture2 className="size-4" />
        </button>
      )}
      {!mini && !cinema && !discreet && (
        <button
          type="button"
          onClick={onToggleAmbient}
          aria-pressed={ambient}
          aria-label="Ambient light"
          title={ambient ? "Turn off ambient light" : "Turn on ambient light"}
          className={cn(
            "flex size-9 items-center justify-center rounded-full backdrop-blur-sm transition-colors",
            ambient ? "bg-white/25 hover:bg-white/35" : "bg-black/60 hover:bg-black/80",
          )}
        >
          <Lightbulb className={cn("size-4", ambient && "fill-current")} />
        </button>
      )}
      {!mini && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label="Fullscreen"
          title="Fullscreen (f)"
          className="flex size-9 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          <Maximize className="size-4" />
        </button>
      )}
      {mini && hasNextQueued && (
        <button
          type="button"
          onClick={onPlayNext}
          aria-label="Play next queued video"
          title="Play next queued video"
          className="flex h-9 items-center gap-1.5 rounded-full bg-black/60 px-3 text-xs backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          Next <ChevronRight className="size-4" />
        </button>
      )}
      {!mini && (
        <button
          type="button"
          onClick={onToggleCinema}
          aria-label={
            cinema ? "Exit Cinema Mode" : "Enter Cinema Mode"
          }
          title={cinema ? "Exit Cinema Mode" : "Cinema Mode (c)"}
          className="flex h-9 items-center gap-1.5 rounded-full bg-black/60 px-3 text-xs backdrop-blur-sm transition-colors hover:bg-black/80"
        >
          <MonitorPlay className="size-4" />
          {cinema ? "Exit" : "Cinema"}
        </button>
      )}
    </div>
  );
}
