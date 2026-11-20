import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlbumStack } from "@/components/AlbumStack";
import { AppShell } from "@/components/AppShell";
import { PageBody } from "@/components/PageBody";
import { PageScope } from "@/lib/appearance";
import { fetchAlbums, type AlbumSummary } from "@/lib/albumApi";
import { qk } from "@/lib/queryKeys";
import { albumTransition } from "@/lib/albumTransition";

function AlbumCard({ album }: { album: AlbumSummary }) {
  // Set on click, flushed before the router navigates, so the old page's
  // snapshot already carries the transition names (see AlbumStack).
  //
  // Also on for the card of the album just left, so the transition back has
  // something to fold into; cleared once that has played, because names must
  // stay unique and the next album opened sets its own.
  const [opening, setOpening] = useState(() => albumTransition.returningId === album.id);
  useEffect(() => {
    if (albumTransition.returningId !== album.id) return;
    const timer = setTimeout(() => {
      albumTransition.returningId = null;
      setOpening(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [album.id]);
  return (
    <Link
      to="/album/$albumId"
      params={{ albumId: String(album.id) }}
      viewTransition
      onClick={() => {
        albumTransition.returningId = null;
        flushSync(() => setOpening(true));
      }}
      className="motion-card group block rounded-lg focus-visible:outline-none"
    >
      {/* 3:2, matching the photos themselves (3000x2000). */}
      <AlbumStack album={album} opening={opening} />

      {/* Below the cover rather than overlaid: a gradient dark enough to hold
          text covers the part of the photo you are choosing between. */}
      <div className="mt-3 space-y-0.5">
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
        <PageBody>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton aspect-[3/2] rounded-lg" />
              ))}
            </div>
          ) : albums.length === 0 ? (
            <p className="text-muted-foreground">
              No albums yet — a folder of images next to a video becomes one automatically.
            </p>
          ) : (
            <div className="stagger grid grid-cols-2 gap-x-14 gap-y-16 md:grid-cols-4 lg:grid-cols-6">
              {albums.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>
          )}
        </PageBody>
      </AppShell>
    </PageScope>
  );
}
