import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, Pin } from "lucide-react";
import { invalidatePerformer } from "@/lib/invalidate";

// Dwell before the panel appears, matching the media tiles.
const HOVER_DELAY_MS = 450;
import { cn } from "@/lib/utils";
import {
  performerPortraitUrl,
  portraitStyle,
  setPerformerFavorite,
  type PerformerSummary,
} from "@/lib/performerApi";
import { isPinned, togglePin } from "@/lib/pinned";
import { useToast } from "@/lib/toast";
import { PerformerHoverCard } from "./PerformerHoverCard";
import { arrivedAgo } from "@/lib/followingApi";

// Re-exported because several components import the type from here. It used
// to be declared here too — a second, drifting copy of the one in
// performerApi, which is why adding portrait framing to that one silently
// failed to reach the cards.
export type { PerformerSummary };

export function PerformerCard({
  performer,
  onClick,
  mono = false,
  isNew = false,
  small = false,
}: {
  performer: PerformerSummary;
  onClick: () => void;
  /** A smaller card, for a row of them inside another page. */
  small?: boolean;
  /** Added recently: a small pink NEW mark in the corner. */
  isNew?: boolean;
  /** The wall on the performers page: the name in spaced capitals, and a
   *  pink edge and glow on hover. */
  mono?: boolean;
}) {
  // A video-frame fallback can 404 — poster existence is a filesystem check,
  // not a DB fact — so a failed load drops to the initial rather than leaving
  // a broken image.
  const [imageFailed, setImageFailed] = useState(false);
  const portrait = performerPortraitUrl(performer);
  const showImage = portrait !== null && !imageFailed;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pinned, setPinned] = useState(() => isPinned(`performer:${performer.id}`));
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nothing should be left pending on a card that has gone — a grid rerender
  // while the timer is armed would otherwise open a panel for a card that is
  // no longer under the pointer.
  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, []);

  const favorite = useMutation({
    mutationFn: (next: boolean) => setPerformerFavorite(performer.id, next),
    onSuccess: () => {
      // The list re-sorts around this, so it has to come back from the server
      // rather than being patched in place.
      invalidatePerformer(queryClient, performer.id);
    },
    // The heart fills from server state, so a failure just leaves it looking
    // unpressed — indistinguishable from the click not registering at all.
    onError: (error) => {
      toast({
        title: "Could not update favourite",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "error",
      });
    },
  });

  function open() {
    if (cardRef.current) setAnchorRect(cardRef.current.getBoundingClientRect());
  }

  // The same dwell the media tiles use, for the same reason: sweeping a
  // pointer along a row of portraits should not throw up a card for each one.
  function handleMouseEnter() {
    hoverTimer.current = setTimeout(open, HOVER_DELAY_MS);
  }

  function handleMouseLeave() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    // The panel cancels this itself if the pointer lands on it, so the gap
    // between card and panel is crossable.
    setAnchorRect(null);
  }

  return (
    <>
      {/* A wrapper rather than the card itself being the button: the favourite
        toggle is a button too, and a button inside a button is invalid HTML —
        browsers drop the inner one, so the heart would simply not work. */}
      <div
        ref={cardRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "motion-card group relative aspect-[2/3] shrink-0 overflow-hidden rounded-lg bg-secondary ring-1 ring-border transition-all duration-300 focus-within:ring-2 focus-within:ring-white",
          small ? "w-32 sm:w-44" : "w-34 sm:w-[275px]",
          // On the wall the hover is the brand's pink: an edge, and a glow.
          mono
            ? "hover:ring-2 hover:ring-primary/80 hover:shadow-[0_0_40px_-8px_rgba(255,45,149,0.55)]"
            : "hover:ring-white/40",
        )}
      >
        <button
          type="button"
          onClick={onClick}
          onFocus={open}
          onBlur={() => setAnchorRect(null)}
          title={performer.name}
          className="block h-full w-full focus-visible:outline-none"
        >
          {showImage ? (
            <img
              src={portrait}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
              style={portraitStyle(performer)}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-3xl font-semibold text-muted-foreground">
              {performer.name.trim()[0]?.toUpperCase() ?? "?"}
            </span>
          )}

          {isNew && (
            <span className="pointer-events-none absolute bottom-[4.5rem] right-2 rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white shadow-[0_0_12px_rgba(255,45,149,0.6)]">
              New
            </span>
          )}

          {/* A dim on hover only — at rest the artwork is untouched, so the
            labels below sit on the picture rather than over a greyed one. */}
          <span
            className={cn(
              "pointer-events-none absolute inset-0 transition-colors duration-300",
              // A faint pink wash rising from the bottom on the wall; a plain dim elsewhere.
              // (Faded by opacity: a gradient's colours don't animate.)
              mono
                ? "bg-gradient-to-t from-primary/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
                : "bg-black/0 group-hover:bg-black/20",
            )}
          />

          {/* Always visible: a wall of unlabelled portraits looks tidy but makes
            you hover every one to find anybody. The gradient is what keeps the
            text legible over whatever the picture happens to be doing here. */}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3 pt-8 text-left">
            <span
              className={cn(
                "sensitive line-clamp-2 leading-tight text-white drop-shadow",
                mono ? "text-xs font-semibold uppercase tracking-[0.2em]" : "text-sm font-semibold",
              )}
            >
              {performer.name}
            </span>
            {mono && (
              <span className="mt-2 block h-px w-6 bg-primary transition-all duration-500 group-hover:w-12" />
            )}
            {mono && (performer.topStudio || performer.latestAddedAt) && (
              <span className="sensitive mt-1.5 block truncate text-[11px] text-white/80">
                {[performer.topStudio, arrivedAgo(performer.latestAddedAt ?? null)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
            <span className={cn("block text-[11px] text-white/75", mono ? "mt-0.5 font-mono" : "mt-0.5")}>
              {performer.videoCount} {performer.videoCount === 1 ? "video" : "videos"}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            togglePin({
              id: `performer:${performer.id}`,
              type: "performer",
              label: performer.name,
              performerId: performer.id,
            });
            setPinned((value) => !value);
          }}
          aria-pressed={pinned}
          aria-label={pinned ? `Unpin ${performer.name}` : `Pin ${performer.name}`}
          title={pinned ? "Unpin" : "Pin"}
          className={cn(
            "absolute left-2 top-2 z-10 hidden size-8 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/20 backdrop-blur-sm transition-all hover:bg-black/85 md:flex md:opacity-0 md:group-hover:opacity-100",
            pinned && "md:opacity-100",
          )}
        >
          <Pin className={cn("size-4", pinned && "fill-white")} />
        </button>

        <button
          type="button"
          onClick={() => favorite.mutate(!performer.isFavorite)}
          disabled={favorite.isPending}
          aria-pressed={performer.isFavorite}
          aria-label={
            performer.isFavorite
              ? `Remove ${performer.name} from favourites`
              : `Add ${performer.name} to favourites`
          }
          title={performer.isFavorite ? "Remove from favourites" : "Add to favourites"}
          className={cn(
            "absolute right-2 top-2 z-10 hidden size-8 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/20 backdrop-blur-sm transition-all hover:bg-black/85 focus-visible:opacity-100 disabled:opacity-50 md:flex",
            // Hidden until hover on a pointer device, but a favourited card
            // keeps its heart — that mark is why the card is sitting at the top
            // of the page, so hiding it would make the ordering look arbitrary.
            // Small screens have no hover state, so it stays put there.
            "md:opacity-0 md:group-hover:opacity-100",
            performer.isFavorite && "md:opacity-100",
          )}
        >
          <Heart className={cn("size-4", performer.isFavorite && "fill-red-500 text-red-500")} />
        </button>
      </div>
      {anchorRect && (
        <PerformerHoverCard
          performer={performer}
          anchorRect={anchorRect}
          onDismiss={() => setAnchorRect(null)}
        />
      )}
    </>
  );
}
