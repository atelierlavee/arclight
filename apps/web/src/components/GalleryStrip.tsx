import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { PhotoLightbox } from "./PhotoLightbox";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { qk } from "@/lib/queryKeys";

type GalleryImage = { id: number; title: string; thumbnailFile: string | null };

async function fetchGallery(
  itemId: number
): Promise<{ albumId: number | null; total: number; images: GalleryImage[] }> {
  const res = await fetch(`/api/media-items/${itemId}/gallery`);
  if (!res.ok) throw new Error(`Failed to load gallery: ${res.status}`);
  return res.json();
}

/**
 * A preview of the stills that live in the same folder as this video.
 *
 * The server caps what comes back, so this is a taste rather than the set —
 * the album page is where you actually look through 121 photos, and the tile
 * at the end of the row is how you get there.
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
  const hidden = total - images.length;
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // Reset when the modal swaps to another item, or the lightbox would reopen
  // on an index belonging to the previous video's gallery.
  useEffect(() => setOpenIndex(null), [itemId]);

  if (images.length === 0) return null;

  return (
    <div className="space-y-2 px-4 pb-6 md:px-6">
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Gallery
        </h3>
        <span className="text-[11px] text-muted-foreground/70">{total} images</span>
      </div>

      <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {images.map((image, index) => (
          <li key={image.id} className="w-48 shrink-0 snap-start sm:w-56">
            <button
              type="button"
              onClick={() => setOpenIndex(index)}
              // Counts the previewed set, not the album — that's what the
              // lightbox actually pages through from here.
              aria-label={`Open image ${index + 1} of ${images.length}`}
              className="group w-full"
            >
              <img
                src={thumbnailUrl(image)}
                alt=""
                loading="lazy"
                className="aspect-[3/2] w-full rounded object-cover ring-1 ring-border transition-all group-hover:ring-white/40"
              />
            </button>
          </li>
        ))}

        {/* Only worth a tile when there's genuinely more behind it. */}
        {hidden > 0 && data?.albumId != null && (
          <li className="w-48 shrink-0 snap-start sm:w-56">
            <Link
              to="/album/$albumId"
              params={{ albumId: String(data.albumId) }}
              className="group flex aspect-[3/2] w-full flex-col items-center justify-center gap-1 rounded bg-secondary/60 ring-1 ring-border transition-colors hover:bg-secondary"
            >
              <span className="text-sm font-medium">See all {total}</span>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {hidden} more
                <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        )}
      </ul>

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
