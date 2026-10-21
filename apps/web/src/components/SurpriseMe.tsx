import { useEffect, useRef, useState } from "react";
import { Dices, Loader2, X } from "lucide-react";
import { DURATION_OPTIONS, filterParams, type Filters } from "@/lib/filters";
import { framingStyle, thumbnailUrl } from "@/lib/mediaItemApi";
import { readRecent } from "@/lib/recent";
import { useAppearance } from "@/lib/appearance";
import { cn } from "@/lib/utils";
import { Portal } from "./Portal";
import type { MediaCardItem } from "./MediaCard";
import { useFocusTrap } from "@/lib/useFocusTrap";

type Source = "any" | "unwatched" | "favourites";

const SOURCES: { value: Source; label: string }[] = [
  { value: "any", label: "Anything" },
  { value: "unwatched", label: "Unwatched" },
  { value: "favourites", label: "Favourites" },
];

/**
 * Controlled random discovery (§7, §14).
 *
 * "Surprise Me should support constraints rather than being a completely
 * blind randomizer" — a blind pick from a large library mostly returns
 * things you have already seen, which is the one result that makes the
 * feature useless.
 *
 * It reads only. §7 is explicit that generating a result must not change
 * library state, so rolling again does not mark anything watched, does not
 * touch play counts, and is not recorded as an interaction — only actually
 * playing the result is.
 *
 * Exclusions are applied client-side against local history rather than sent
 * to the server, because "recently watched" here means *on this machine*,
 * which is the only place that history lives (§3).
 */
export function SurpriseMe({ onClose }: { onClose: () => void }) {
  const [source, setSource] = useState<Source>("unwatched");
  const [duration, setDuration] = useState<string | null>(null);
  const [excludeRecent, setExcludeRecent] = useState(true);
  const [pick, setPick] = useState<MediaCardItem | null>(null);
  const [rolling, setRolling] = useState(false);
  const [empty, setEmpty] = useState(false);
  const { discreet, discreetBlurPercent } = useAppearance();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function roll() {
    setRolling(true);
    setEmpty(false);

    const band = DURATION_OPTIONS.find((option) => option.value === duration);
    const filters: Filters = {
      tags: [],
      performers: [],
      watched: source === "unwatched" ? false : undefined,
      favorite: source === "favourites" ? true : undefined,
      minDuration: band?.min,
      maxDuration: band?.max,
    };

    const params = filterParams(filters);
    params.set("sort", "random");
    // A fresh seed per roll is the whole point here, unlike the grid where
    // the seed has to hold across pages.
    params.set("seed", String(Math.floor(Math.random() * 1_000_000)));

    try {
      const res = await fetch(`/api/media-items?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items: MediaCardItem[] };

      const excluded = excludeRecent
        ? new Set(readRecent("played").map((entry) => entry.id))
        : new Set<number>();
      const candidates = data.items.filter(
        (item) => item.itemType === "video" && !excluded.has(item.id),
      );

      // Re-picked from the page rather than taking the first row: the server
      // shuffled the whole library, but filtering the page down locally would
      // otherwise bias the result towards whatever survived at the top.
      const chosen =
        candidates[Math.floor(Math.random() * candidates.length)] ?? null;
      setPick(chosen);
      setEmpty(chosen === null);
    } catch {
      setPick(null);
      setEmpty(true);
    } finally {
      setRolling(false);
    }
  }

  const choiceClass = (active: boolean) =>
    cn(
      "rounded-full px-2.5 py-1 text-xs transition-colors",
      active
        ? "bg-foreground text-background"
        : "bg-secondary/70 text-muted-foreground hover:text-foreground",
    );

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Surprise me"
          className="animate-soft-pop w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-4 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Dices className="size-4" /> Surprise me
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              From
            </span>
            <div className="flex flex-wrap gap-1">
              {SOURCES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSource(option.value)}
                  aria-pressed={source === option.value}
                  className={choiceClass(source === option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Length
            </span>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setDuration(null)}
                aria-pressed={duration === null}
                className={choiceClass(duration === null)}
              >
                Any
              </button>
              {DURATION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setDuration(duration === option.value ? null : option.value)
                  }
                  aria-pressed={duration === option.value}
                  className={choiceClass(duration === option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={excludeRecent}
              onChange={(event) => setExcludeRecent(event.target.checked)}
              className="size-3.5 accent-current"
            />
            Skip things I&rsquo;ve played recently
          </label>

          {pick && (
            <div className="space-y-2 rounded-md border border-border p-2">
              <img
                src={thumbnailUrl(pick)}
                alt=""
                style={{
                  ...framingStyle(pick),
                  ...(discreet
                    ? { filter: `blur(${discreetBlurPercent / 4}px)` }
                    : undefined),
                }}
                className="aspect-video w-full rounded object-cover"
              />
              <p className="sensitive truncate text-sm font-medium">
                {pick.title}
              </p>
            </div>
          )}

          {empty && (
            <p className="text-xs text-muted-foreground">
              Nothing matched those constraints. Try widening the length, or
              allowing things you&rsquo;ve already played.
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void roll()}
              disabled={rolling}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent disabled:opacity-50"
            >
              {rolling ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Dices className="size-3.5" />
              )}
              {pick ? "Roll again" : "Pick something"}
            </button>
            {pick && (
              <button
                type="button"
                onClick={() => {
                  const chosen = pick;
                  onClose();
                  // Announced after closing so the player opens over a page
                  // this dialog is no longer covering.
                  window.dispatchEvent(
                    new CustomEvent("media-server:play-item", {
                      detail: { id: chosen.id, resume: false },
                    }),
                  );
                }}
                className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Play it
              </button>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
