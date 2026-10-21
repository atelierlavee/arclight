import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Heart, Users } from "lucide-react";
import { fetchPerformer, performerBannerUrl } from "@/lib/performerApi";
import { flyoutBox } from "@/lib/hoverCard";
import { Portal } from "./Portal";
import type { PerformerSummary } from "./PerformerCard";
import { qk } from "@/lib/queryKeys";

function formatDuration(seconds: number): string | null {
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

const WIDTH = 320;
/**
 * A starting guess, replaced by the real height once the card has rendered.
 * Measured rather than assumed because the height decides both the vertical
 * centring and where the caret sits — a guess a few pixels out leaves the
 * caret visibly off the tile it is meant to be pointing at.
 */
const ESTIMATED_HEIGHT = 300;

/** Long enough to cross the gap between the card and this panel. */
const DISMISS_GRACE_MS = 120;

/**
 * A performer's details, shown by pointing at their card.
 *
 * This was a modal behind an eye button — a click, a backdrop, and a dialog to
 * dismiss, to read four numbers. Pointing at a card is how the media tiles
 * already reveal themselves, and reading something should not cost a
 * round-trip through a dialog.
 *
 * Beside the tile rather than over or under it. Dropped underneath it covered
 * the row below and read as a menu belonging to the page; centred on the tile
 * it hid the very picture being pointed at. A flyout with a caret keeps the
 * tile visible and says which one it belongs to. It flips to the other side
 * near an edge and stays inside the window.
 */
export function PerformerHoverCard({
  performer,
  anchorRect,
  onDismiss,
}: {
  performer: PerformerSummary;
  anchorRect: DOMRect;
  onDismiss: () => void;
}) {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: qk.performer.detail(performer.id),
    queryFn: () => fetchPerformer(performer.id),
  });
  // The banner, not the portrait: this panel is a wide strip, and a 2:3
  // portrait cropped into it shows a band across the middle of somebody.
  // Falls back through the same preference order the profile page uses.
  const banner = performerBannerUrl(data ?? performer);
  // Only the detail carries the framing the banner was positioned with.
  const bannerPositionY = data?.bannerPositionY ?? 50;

  const [visible, setVisible] = useState(false);
  const [height, setHeight] = useState(ESTIMATED_HEIGHT);
  const panelRef = useRef<HTMLDivElement>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Before paint, so the card is never seen at the guessed position first.
  useLayoutEffect(() => {
    const measured = panelRef.current?.offsetHeight;
    if (measured) setHeight(measured);
  }, [data]);

  // Fade in on the frame after mount so the browser has a state to move from.
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(id);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  // A grace period, because the pointer has to cross a gap to get here and an
  // immediate dismissal would make the card unreachable.
  function scheduleDismiss() {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(onDismiss, DISMISS_GRACE_MS);
  }

  function cancelDismiss() {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }

  const { left, top, side, caretTop } = flyoutBox(
    anchorRect,
    { width: window.innerWidth, height: window.innerHeight },
    { width: WIDTH, height },
  );

  const watch = data?.watch;

  // All derived from the detail, so nothing shows until it has loaded and
  // nothing here can disagree with the profile page's own figures.
  const duration = formatDuration(data?.totalDurationSeconds ?? 0);
  // The null bucket is "no studio", not a studio.
  const studioCount = data?.studios.filter((s) => s.name !== null).length ?? 0;
  const years = (data?.years ?? [])
    .map((y) => y.year)
    .filter((y): y is number => y !== null);
  const yearRange = years.length
    ? (() => {
        const [from, to] = [Math.min(...years), Math.max(...years)];
        return from === to ? `${from}` : `${from}–${to}`;
      })()
    : null;
  // Who they actually appear with, which is the one thing here you cannot get
  // from the tile itself. Ordered by shared videos, so these are the regulars
  // rather than a one-off.
  const coStars = (data?.coPerformers ?? [])
    .slice()
    .sort((a, b) => b.together - a.together)
    .slice(0, 2);

  // Each line is dropped when it would be empty rather than printing zeroes,
  // the same rule the profile's stats strip follows.
  const context = [
    studioCount > 0
      ? `${studioCount} ${studioCount === 1 ? "studio" : "studios"}`
      : null,
    yearRange,
  ].filter(Boolean);

  return (
    <Portal>
      <div
        ref={panelRef}
        role="dialog"
        aria-label={`${performer.name} details`}
        onMouseEnter={cancelDismiss}
        onMouseLeave={scheduleDismiss}
        style={{ left, top, width: WIDTH, opacity: visible ? 1 : 0 }}
        // No overflow-hidden here: it would clip the caret off. The image
        // rounds its own top corners instead.
        className="fixed z-50 rounded-xl border border-border bg-card shadow-2xl transition-opacity duration-150"
      >
        {/* A rotated square with only the two edges that form its outward
            corner, so it reads as a point on the card rather than a diamond
            sitting next to it. */}
        <span
          aria-hidden="true"
          style={{
            top: caretTop - 6,
            [side === "right" ? "left" : "right"]: -6,
          }}
          className={
            side === "right"
              ? "absolute size-3 rotate-45 border-b border-l border-border bg-card"
              : "absolute size-3 rotate-45 border-r border-t border-border bg-card"
          }
        />
        <div className="relative aspect-[2.4/1] overflow-hidden rounded-t-xl bg-secondary">
          {banner ? (
            <img
              src={banner}
              alt=""
              style={{ objectPosition: `50% ${bannerPositionY}%` }}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-3xl font-semibold text-muted-foreground">
              {performer.name.trim()[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
          <h2 className="sensitive absolute bottom-3 left-4 right-4 truncate text-lg font-bold text-white drop-shadow-md">
            {performer.name}
          </h2>
          {performer.isFavorite && (
            <Heart
              className="absolute right-3 top-3 size-4 fill-red-500 text-red-500 drop-shadow"
              aria-label="Favourite performer"
            />
          )}
        </div>

        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold tabular-nums text-foreground">
              {performer.videoCount}
            </span>
            <span className="text-muted-foreground">
              {performer.videoCount === 1 ? "video" : "videos"}
            </span>
            {duration && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {duration}
                </span>
              </>
            )}
            {watch && watch.unwatched > 0 && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="font-semibold tabular-nums text-amber-500">
                  {watch.unwatched}
                </span>
                <span className="text-muted-foreground">unwatched</span>
              </>
            )}
          </div>

          {context.length > 0 && (
            <p className="text-xs text-muted-foreground/80">
              {context.join(" · ")}
            </p>
          )}

          {coStars.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground/80">
              <Users className="mt-0.5 size-3.5 shrink-0" />
              <span className="sensitive">
                Often with {coStars.map((p) => p.name).join(" and ")}
              </span>
            </p>
          )}

          <button
            type="button"
            onClick={() =>
              void navigate({
                to: "/performer/$performerId",
                params: { performerId: String(performer.id) },
              })
            }
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background transition-colors hover:bg-foreground/85"
          >
            Open performer <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </Portal>
  );
}
