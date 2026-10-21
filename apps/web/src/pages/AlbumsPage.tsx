import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Images } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageScope } from "@/lib/appearance";
import { coverFramingStyle, fetchAlbums, type AlbumSummary } from "@/lib/albumApi";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { cn } from "@/lib/utils";
import { qk } from "@/lib/queryKeys";

function AlbumCard({ album }: { album: AlbumSummary }) {
  const framing = coverFramingStyle(album);
  return (
    <Link
      to="/album/$albumId"
      params={{ albumId: String(album.id) }}
      className="motion-card group block rounded-lg focus-visible:outline-none"
    >
      {/* 3:2, matching the photos themselves (3000x2000). At 16:9 every cover
          lost its top and bottom to the crop. */}
      <div className="relative aspect-[3/2] w-full overflow-hidden rounded-lg bg-secondary ring-1 ring-border transition-all duration-200 group-hover:ring-white/40">
        {album.coverItemId != null ? (
          <img
            src={thumbnailUrl({ id: album.coverItemId })}
            alt=""
            loading="lazy"
            style={framing}
            className={cn(
              "h-full w-full object-cover transition-transform duration-300",
              // The framing sets its own transform, and an inline style beats
              // a class — so the hover zoom only applies where there's no
              // chosen framing for it to fight with.
              !framing && "group-hover:scale-[1.03]"
            )}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Images className="size-8 text-muted-foreground" />
          </div>
        )}

        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          <Images className="size-3" />
          {album.photoCount}
        </span>
      </div>

      {/* Below the cover rather than overlaid: a gradient dark enough to hold
          text covers the part of the photo you are choosing between. */}
      <div className="mt-2 space-y-0.5">
        <h3 className="sensitive truncate text-sm font-medium leading-snug group-hover:underline">
          {album.title}
        </h3>
        <p className="sensitive truncate text-[11px] text-muted-foreground">
          {[album.performer, album.studio].filter(Boolean).join(" · ")}
        </p>
      </div>
    </Link>
  );
}

export function AlbumsPage() {
  // Wrapped, not passed by reference: react-query hands the query context
  // as the first argument, which fetchAlbums would read as a performer name.
  const { data, isLoading } = useQuery({ queryKey: qk.albums.all, queryFn: () => fetchAlbums() });
  const albums = data?.albums ?? [];

  return (
    <PageScope name="albums">
      <AppShell title="Albums" subtitle="Photo sets that came with your videos.">
        <div className="px-4 py-6 md:px-6">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton aspect-[3/2] rounded-lg" />
              ))}
            </div>
          ) : albums.length === 0 ? (
            <p className="text-muted-foreground">
              No albums yet — a folder of images next to a video becomes one automatically.
            </p>
          ) : (
            <div className="stagger grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
              {albums.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>
          )}
        </div>
      </AppShell>
    </PageScope>
  );
}
