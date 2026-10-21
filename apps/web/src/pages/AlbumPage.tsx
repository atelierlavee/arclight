import { useCallback, useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { Crop, Star } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { FramingEditor, type FramingValue } from "@/components/FramingEditor";
import { fetchAlbum, saveAlbumCover } from "@/lib/albumApi";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { cn } from "@/lib/utils";
import { PlaySurface } from "@/components/PlaySurface";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { qk } from "@/lib/queryKeys";

const routeApi = getRouteApi("/album/$albumId");

export function AlbumPage() {
  const { albumId } = routeApi.useParams();
  const id = Number(albumId);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const queryClient = useQueryClient();

  const [reframing, setReframing] = useState(false);

  const cover = useMutation({
    mutationFn: (patch: Parameters<typeof saveAlbumCover>[1]) =>
      saveAlbumCover(id, patch),
    onSuccess: () => {
      setReframing(false);
      queryClient.invalidateQueries({ queryKey: qk.album.detail(id) });
      // Prefix match, so both the albums page and the row on each performer's
      // profile repaint with the new face.
      queryClient.invalidateQueries({ queryKey: qk.albums.all });
    },
  });

  const { data, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: qk.album.detail(id),
      queryFn: ({ pageParam }) => fetchAlbum(id, pageParam),
      initialPageParam: 1,
      getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    });

  // Shared by the scroll sentinel and the lightbox, so reaching the end of
  // either loads the next page.
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      // Start early so scrolling doesn't visibly stall at the boundary.
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, loadMore]);

  // Below every hook, not above them.
  //
  // This return used to sit before the three hooks above, which meant a
  // failed load rendered fewer hooks than the render before it — React
  // counts them positionally, so the transition from loading to error threw
  // rather than showing this message. None of those hooks need the data:
  // the effect stands down when there is no sentinel or no next page.
  if (isError) {
    return (
      <AppShell title="Album not found">
        <p className="px-4 text-sm text-muted-foreground md:px-6">
          That album doesn’t exist — its folder may have been removed.
        </p>
      </AppShell>
    );
  }

  const album = data?.pages[0];
  // What the album card actually shows: the hand-picked photo, or the first
  // one when it's still automatic. Framing has to preview against that exact
  // image or you'd be cropping something the card never displays.
  const coverPhoto =
    (album?.coverItemId != null
      ? data?.pages
          .flatMap((p) => p.photos)
          .find((p) => p.id === album.coverItemId)
      : undefined) ?? data?.pages[0]?.photos[0];
  // Flattened across pages, so the lightbox can step through everything
  // loaded so far rather than restarting at each page boundary.
  const photos = data?.pages.flatMap((p) => p.photos) ?? [];

  return (
    <AppShell>
      <div className="space-y-6 px-4 py-6 md:px-6 md:py-8">
        <Breadcrumbs
          items={[
            { label: "Albums", to: "/albums" },
            ...(album?.performer ? [{ label: album.performer }] : []),
            ...(album?.studio ? [{ label: album.studio }] : []),
            ...(album ? [{ label: album.title }] : []),
          ]}
        />
        <div className="space-y-2">
          <h1 className="sensitive text-3xl font-bold tracking-tight sm:text-4xl">
            {album?.title ?? " "}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {album?.performer && (
              <Link
                to="/browse"
                search={{ performer: album.performer }}
                className="font-medium text-foreground/90 hover:underline"
              >
                {album.performer}
              </Link>
            )}
            {album?.studio && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>{album.studio}</span>
              </>
            )}
            <span className="text-muted-foreground/40">·</span>
            <span>{photos.length} photos</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {album?.video && (
              <PlaySurface
                items={[
                  {
                    ...album.video,
                    itemType: "video",
                    thumbnailFile: null,
                    durationSeconds: null,
                  },
                ]}
                label="Album playback"
              />
            )}
            {coverPhoto && !reframing && (
              <button
                type="button"
                onClick={() => setReframing(true)}
                className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                <Crop className="size-4" />
                Reposition cover
              </button>
            )}
          </div>

          {reframing && coverPhoto && album && (
            <FramingEditor
              src={thumbnailUrl(coverPhoto)}
              value={{
                x: album.coverPositionX,
                y: album.coverPositionY,
                scale: album.coverScale,
              }}
              // The frame the album card actually crops to. Preview at any
              // other ratio and you'd choose a band that gets cut elsewhere.
              aspectClass="aspect-[3/2]"
              saving={cover.isPending}
              onSave={(next: FramingValue) =>
                cover.mutate({
                  // Pins the photo as well when the cover was still automatic:
                  // otherwise a later scan could change which photo comes
                  // first, and this framing would be applied to a different
                  // picture. Sent together, so the server keeps the framing
                  // rather than resetting it as a cover change.
                  coverItemId: album.coverItemId ?? coverPhoto.id,
                  coverPositionX: next.x,
                  coverPositionY: next.y,
                  coverScale: next.scale,
                })
              }
              onCancel={() => setReframing(false)}
              note="Used on the albums page and on each performer's profile."
            />
          )}
        </div>

        <div className="stagger grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo, index) => {
            const isCover = album?.coverItemId === photo.id;
            return (
              // A wrapper rather than the tile itself being the button: the
              // cover control is a button too, and a button inside a button is
              // invalid — browsers drop the inner one, so it wouldn't fire.
              <div key={photo.id} className="group relative">
                <button
                  type="button"
                  onClick={() => setOpenIndex(index)}
                  aria-label={`Open photo ${index + 1}`}
                  className="block w-full focus-visible:outline-none"
                >
                  <img
                    src={thumbnailUrl(photo)}
                    alt=""
                    loading="lazy"
                    className={cn(
                      "aspect-[3/2] w-full rounded-md object-cover ring-1 transition-all",
                      isCover
                        ? "ring-2 ring-white/70"
                        : "ring-border group-hover:ring-white/40",
                    )}
                  />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    cover.mutate({ coverItemId: isCover ? null : photo.id })
                  }
                  disabled={cover.isPending}
                  aria-pressed={isCover}
                  title={
                    isCover
                      ? "Cover — click to go back to automatic"
                      : "Use as album cover"
                  }
                  aria-label={
                    isCover
                      ? "Clear the album cover"
                      : "Use this photo as the album cover"
                  }
                  className={cn(
                    "absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/65 text-white ring-1 ring-white/20 backdrop-blur-sm transition-all hover:bg-black/90 focus-visible:opacity-100 disabled:opacity-50",
                    // The chosen one keeps its star: it's why this photo is on
                    // the album card, so hiding it behind hover would leave
                    // that unexplained. Hover-only elsewhere, and always shown
                    // on small screens, which have no hover state at all.
                    "md:opacity-0 md:group-hover:opacity-100",
                    isCover && "md:opacity-100",
                  )}
                >
                  <Star
                    className={cn(
                      "size-4",
                      isCover && "fill-yellow-400 text-yellow-400",
                    )}
                  />
                </button>
              </div>
            );
          })}
        </div>

        {/* Infinite scroll, matching the media grid — a button was the odd
            one out, and 121 photos is a lot of clicking. */}
        <div ref={sentinelRef} aria-hidden className="h-px" />

        {isFetchingNextPage && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton aspect-[3/2] rounded-md" />
            ))}
          </div>
        )}
      </div>

      {openIndex !== null && (
        <PhotoLightbox
          photos={photos}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          onReachEnd={loadMore}
        />
      )}
    </AppShell>
  );
}
