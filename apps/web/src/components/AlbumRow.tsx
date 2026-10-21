import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Images } from "lucide-react";
import { ScrollRow } from "./ScrollRow";
import { coverFramingStyle, fetchAlbums } from "@/lib/albumApi";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { cn } from "@/lib/utils";
import { qk } from "@/lib/queryKeys";

/**
 * The photo sets belonging to one performer or one studio.
 *
 * A scrolling row rather than a grid: a profile page is about its videos, and
 * albums are a way across to the full set rather than the main event. Renders
 * nothing when there are none.
 *
 * Built on `ScrollRow` like every other row on those pages, which is what
 * gives it edge arrows and a hidden scrollbar — this used to roll its own
 * overflow container and was the only section showing a native scrollbar.
 */
export function AlbumRow({ performer, studio }: { performer?: string; studio?: string }) {
  const { data, isLoading } = useQuery({
    // Both keys are always present, so a performer page and a studio page can
    // never share a cache entry by accident.
    queryKey: qk.albums.list(performer ?? null, studio ?? null),
    queryFn: () => fetchAlbums({ performer, studio }),
  });
  const albums = data?.albums ?? [];

  return (
    <ScrollRow
      title="Albums"
      titleClassName="text-xl font-semibold tracking-tight sm:text-2xl"
      action={
        // Withheld rather than shown as "0 albums", which would be a wrong
        // answer rather than a pending one.
        isLoading ? null : (
          <span className="shrink-0 text-sm text-muted-foreground">
            {albums.length} {albums.length === 1 ? "album" : "albums"}
          </span>
        )
      }
      itemCount={albums.length}
      loading={isLoading}
    >
      {isLoading
        ? Array.from({ length: 4 }).map((_, index) => (
            <div key={`placeholder-${index}`} className="w-60 shrink-0 sm:w-72">
              <div className="skeleton aspect-[3/2] w-full rounded-lg" />
              {/* The title and studio lines below the cover, so the row does
                  not grow taller as the real cards arrive. */}
              <div className="skeleton mt-2 h-4 w-3/4 rounded" />
              <div className="skeleton mt-1.5 h-3 w-1/2 rounded" />
            </div>
          ))
        : albums.map((album) => (
            <Link
              key={album.id}
              to="/album/$albumId"
              params={{ albumId: String(album.id) }}
              className="group block w-60 shrink-0 focus-visible:outline-none sm:w-72"
            >
              <div className="relative aspect-[3/2] w-full overflow-hidden rounded-lg bg-secondary ring-1 ring-border transition-all group-hover:ring-white/40">
                {album.coverItemId != null && (
                  <img
                    src={thumbnailUrl({ id: album.coverItemId })}
                    alt=""
                    loading="lazy"
                    style={coverFramingStyle(album)}
                    className={cn(
                      "h-full w-full object-cover transition-transform duration-300",
                      // An inline transform beats the class, so the hover zoom is
                      // only applied where no framing was chosen.
                      !coverFramingStyle(album) && "group-hover:scale-[1.03]"
                    )}
                  />
                )}
                <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                  <Images className="size-3" />
                  {album.photoCount}
                </span>
              </div>
              <h3 className="sensitive mt-2 truncate text-sm font-medium group-hover:underline">
                {album.title}
              </h3>
              <p className="truncate text-[11px] text-muted-foreground">{album.studio}</p>
            </Link>
          ))}
    </ScrollRow>
  );
}
