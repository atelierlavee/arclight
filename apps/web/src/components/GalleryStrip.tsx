import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { PhotoLightbox } from "./PhotoLightbox";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { qk } from "@/lib/queryKeys";

type GalleryImage = { id: number; title: string; thumbnailFile: string | null };

async function fetchGallery(
  itemId: number,
): Promise<{ albumId: number | null; total: number; images: GalleryImage[] }> {
  const res = await fetch(`/api/media-items/${itemId}/gallery`);
  if (!res.ok) throw new Error(`Failed to load gallery: ${res.status}`);
  return res.json();
}

/**
 * A preview of the stills that live in the same folder as this video, as a
 * simple slider: one row of photos, scrolled sideways or with the arrows.
 *
 * A taste rather than the set — the album page is where you look through
 * all 121 photos, and "See all" is how you get there.
 */
export function GalleryStrip({ itemId }: { itemId: number }) {
  const { data } = useQuery({
    queryKey: qk.gallery(itemId),
    queryFn: () => fetchGallery(itemId),
  });
  const images = data?.images ?? [];
  // Older responses had no `total`; falling back to what we were given keeps
  // the count honest rather than reading "See all 0".
  const total = data?.total ?? images.length;
  const hidden = total - Math.min(images.length, 20);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // Reset when the modal swaps to another item, or the lightbox would reopen
  // on an index belonging to the previous video's gallery.
  useEffect(() => setOpenIndex(null), [itemId]);

  if (images.length === 0) return null;
  // A slideshow's worth; the rest is the album's.
  const wall = images.slice(0, 20);

  return (
    <div className="space-y-4 px-4 pb-6 md:px-6">
      <div className="flex items-baseline gap-2">
        <h3 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
          <span className="h-px w-8 bg-primary/60" />
          Gallery
        </h3>
        <span className="text-[11px] text-muted-foreground/70">{total} images</span>
      </div>

      {/* A simple slider: the photos in a row, scrolled with the arrows. */}
      <div className="group/slider relative">
        <div
          ref={rowRef}
          className="scrollbar-hide flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth"
        >
          {wall.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setOpenIndex(index)}
              aria-label={`Open image ${index + 1} of ${images.length}`}
              className="h-56 shrink-0 snap-start overflow-hidden rounded-sm bg-secondary ring-1 ring-white/5 transition-all hover:ring-2 hover:ring-primary md:h-72"
            >
              <img
                src={thumbnailUrl(image)}
                alt=""
                loading="lazy"
                className="sensitive h-full w-auto max-w-none"
              />
            </button>
          ))}
        </div>
        {wall.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => rowRef.current?.scrollBy({ left: -rowRef.current.clientWidth * 0.8 })}
              aria-label="Previous photos"
              className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover/slider:opacity-100"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => rowRef.current?.scrollBy({ left: rowRef.current.clientWidth * 0.8 })}
              aria-label="Next photos"
              className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover/slider:opacity-100"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      {/* The whole set lives on its album page. */}
      {data?.albumId != null && hidden > 0 && (
        <div className="flex justify-center">
          <Link
            to="/album/$albumId"
            params={{ albumId: String(data.albumId) }}
            className="group flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground transition-colors hover:text-primary"
          >
            See all {total}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      )}

      {openIndex !== null && (
        <PhotoLightbox
          photos={images}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </div>
  );
}
