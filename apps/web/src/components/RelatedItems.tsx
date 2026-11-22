import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { MediaCardItem } from "./MediaCard";
import { PreviewClip } from "./PreviewClip";
import { useAppearance } from "@/lib/appearance";
import { framingStyle, thumbnailUrl } from "@/lib/mediaItemApi";
import { formatDuration } from "@/lib/utils";
import { MediaRow } from "./MediaRow";
import { qk } from "@/lib/queryKeys";

async function fetchRelated(id: number): Promise<{ items: MediaCardItem[] }> {
  const res = await fetch(`/api/media-items/${id}/related`);
  if (!res.ok) throw new Error(`Failed to load related items: ${res.status}`);
  return res.json();
}

function noopOpenFolder() {}

/** What's known of the video playing, to say why each suggestion follows it. */
export type RelatedSource = {
  performers: { id: number; name: string }[];
  studio: string | null;
  tags: { id: number; name: string }[];
};

export function RelatedItems({
  itemId,
  onSelect,
  variant = "row",
  source,
}: {
  itemId: number;
  onSelect: (id: number) => void;
  source?: RelatedSource;
  /** "strip" for the watch page: a sideways film strip under its own heading. */
  variant?: "row" | "strip";
}) {
  const { data, isLoading } = useQuery({
    queryKey: qk.relatedItems.forItem(itemId),
    queryFn: () => fetchRelated(itemId),
  });

  // Folders have no meaningful "more like this" click target inside a modal,
  // so they're dropped rather than given a dead-end card.
  const items = (data?.items ?? []).filter((i) => i.itemType !== "folder");
  // Empty and still-loading look identical from here, so only the settled
  // empty case is allowed to remove the section.
  if (!isLoading && items.length === 0) return null;

  if (variant === "strip")
    return <RelatedRows items={items} loading={isLoading} source={source} onSelect={onSelect} />;

  return (
    <div className="border-t border-border px-4 py-6 md:px-6">
      <MediaRow
        title="More Like This"
        items={items}
        loading={isLoading}
        onSelectItem={onSelect}
        onOpenFolder={noopOpenFolder}
      />
    </div>
  );
}

/**
 * Why a suggestion follows this video, in a few words: the performers it
 * shares, else the studio, else the tags it has in common.
 */
function whyRelated(source: RelatedSource | undefined, item: MediaCardItem): string | null {
  if (!source) return null;
  const shared = (item.performers ?? []).filter((performer) =>
    source.performers.some((own) => own.id === performer.id),
  );
  if (shared.length > 0) {
    return `Same performer · ${shared
      .slice(0, 2)
      .map((performer) => performer.name)
      .join(", ")}`;
  }
  if (source.studio && item.studio === source.studio) return `Same studio · ${source.studio}`;
  const tags = (item.tags ?? []).filter((tag) => source.tags.some((own) => own.id === tag.id));
  if (tags.length > 0) {
    return `Similar · ${tags
      .slice(0, 2)
      .map((tag) => tag.name)
      .join(", ")}`;
  }
  return "Similar";
}

/**
 * "Up next" on the watch page: a slider of tiles, each a still (its clip on
 * hover) with a pink line saying why it follows this one, its title, and
 * studio · year over it; scrolled sideways or with the arrows.
 */
function RelatedRows({
  items,
  loading,
  source,
  onSelect,
}: {
  items: MediaCardItem[];
  loading: boolean;
  source?: RelatedSource;
  onSelect: (id: number) => void;
}) {
  const { hoverPreview, discreet } = useAppearance();
  const rowRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  if (loading) {
    return (
      <div className="flex gap-3 overflow-hidden px-4 md:px-6">
        {Array.from({ length: 5 }, (_, n) => (
          <div key={n} className="skeleton aspect-video w-64 shrink-0 rounded-sm md:w-[22rem]" />
        ))}
      </div>
    );
  }
  return (
    <div className="group/slider relative">
      <div
        ref={rowRef}
        className="scrollbar-hide flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto scroll-smooth px-4 md:scroll-px-6 md:px-6"
      >
        {items.map((item) => {
          const why = whyRelated(source, item);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
              aria-label={item.title}
              className="group relative aspect-video w-64 shrink-0 snap-start overflow-hidden rounded-sm bg-secondary text-left ring-1 ring-white/5 transition-all duration-300 hover:shadow-[0_0_30px_-8px_rgba(255,45,149,0.55)] hover:ring-primary/60 md:w-[22rem]"
            >
              <img
                src={thumbnailUrl(item)}
                alt=""
                loading="lazy"
                style={framingStyle(item)}
                className="sensitive size-full object-cover"
              />
              {hoverPreview && !discreet && hoveredId === item.id && <PreviewClip itemId={item.id} />}
              <span className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/20 to-transparent p-3">
                {why && (
                  <span className="sensitive mb-1 block truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                    {why}
                  </span>
                )}
                <span className="sensitive line-clamp-2 text-sm font-semibold leading-snug text-white">
                  {item.title}
                </span>
                <span className="sensitive mt-0.5 truncate text-[11px] text-white/65">
                  {[item.studio, item.releaseDate?.slice(0, 4)].filter(Boolean).join(" · ")}
                </span>
              </span>
              {item.durationSeconds ? (
                <span className="absolute right-1.5 top-1.5 rounded-sm bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {formatDuration(item.durationSeconds)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {items.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => rowRef.current?.scrollBy({ left: -rowRef.current.clientWidth * 0.8 })}
            aria-label="Previous"
            className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover/slider:opacity-100"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => rowRef.current?.scrollBy({ left: rowRef.current.clientWidth * 0.8 })}
            aria-label="Next"
            className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover/slider:opacity-100"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      )}
    </div>
  );
}
