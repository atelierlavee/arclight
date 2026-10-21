import { useQuery } from "@tanstack/react-query";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { cn } from "@/lib/utils";
import { qk } from "@/lib/queryKeys";

/**
 * The studios in the library, as a row of chips above the grid.
 *
 * A shortcut rather than a filter control: the filter menu already composes
 * arbitrary conditions, and this answers the much commoner question of "show
 * me that studio" in one click. Selecting one writes the same `studio` search
 * param the rest of the app uses, so it composes with everything else and a
 * chip that is already active clears itself.
 *
 * Each chip carries a thumbnail from one of that studio's own items. Studios
 * here have no artwork of their own — the name alone is a row of grey pills,
 * and the picture is what makes the row scannable.
 */

type Studio = {
  id: number;
  name: string;
  videoCount: number;
  representativeItemId: number | null;
};

async function fetchStudios(): Promise<{ studios: Studio[] }> {
  const res = await fetch("/api/studios");
  if (!res.ok) throw new Error(`Failed to load studios: ${res.status}`);
  return res.json();
}

export function StudioChips({
  selected,
  onSelect,
}: {
  /** The studio currently filtered on, or null. */
  selected: string | null;
  /** Called with the studio's name, or null to clear. */
  onSelect: (studio: string | null) => void;
}) {
  const { data } = useQuery({ queryKey: qk.studios.all, queryFn: fetchStudios });

  // Busiest first, so the row opens on the studios worth a shortcut. An
  // alphabetical row of forty would bury them behind whatever starts with A.
  const studios = [...(data?.studios ?? [])]
    .filter((studio) => studio.videoCount > 0)
    .sort((a, b) => b.videoCount - a.videoCount);

  if (studios.length === 0) return null;

  return (
    // Scrolls rather than wraps: a wrapping row of forty studios would push
    // the grid off the screen, and this sits above the thing you came for.
    <div
      // Bled out to the page gutter on a phone: inset by 1px the strip was
      // cut mid-chip a finger's width from the edge, which reads as clipped
      // rather than as something you can scroll.
      className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-1 md:px-1"
    >
      {studios.map((studio) => {
        const active = selected === studio.name;
        return (
          <button
            key={studio.id}
            type="button"
            onClick={() => onSelect(active ? null : studio.name)}
            aria-pressed={active}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs transition-colors",
              active
                ? "bg-foreground text-background"
                : "bg-secondary/60 text-foreground hover:bg-accent",
            )}
          >
            <span className="size-7 shrink-0 overflow-hidden rounded-full bg-secondary ring-1 ring-border">
              {studio.representativeItemId !== null && (
                <img
                  src={thumbnailUrl({ id: studio.representativeItemId })}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="sensitive h-full w-full object-cover"
                />
              )}
            </span>
            <span className="whitespace-nowrap font-medium">{studio.name}</span>
            <span
              className={cn(
                "tabular-nums",
                active ? "text-background/70" : "text-muted-foreground",
              )}
            >
              {studio.videoCount}
            </span>
          </button>
        );
      })}
    </div>
  );
}
