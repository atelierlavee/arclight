import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Rss, UserMinus, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ContextMenu } from "@/components/ContextMenu";
import { FeedSidebar } from "@/components/FeedSidebar";
import { MediaDetailModal } from "@/components/MediaDetailModal";
import { FeedPost, PostSkeleton, type PostHandle } from "@/components/feed/FeedPost";
import { FeedStories } from "@/components/feed/FeedStories";
import { FeedSuggestions } from "@/components/feed/FeedSuggestions";
import { useAppearance } from "@/lib/appearance";
import { isTypingTarget } from "@/lib/appEvents";
import { arrivedSince } from "@/lib/feed";
import { fetchFeed, fetchFollowing, type FeedFilter, type FeedItem } from "@/lib/followingApi";
import { pkey } from "@/lib/profileStorage";
import { qk } from "@/lib/queryKeys";
import { useTileMenu } from "@/lib/tileMenu";
import { useFollowToggle } from "@/lib/useFollowToggle";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";

const routeApi = getRouteApi("/feed");
const LAST_SEEN_KEY = "feed-last-seen";
/** A post has to be at least this much on screen to start playing. */
const AUTOPLAY_MIN_VISIBLE = 0.6;
/** "Suggested for you" goes in after this many posts. */
const SUGGESTIONS_AFTER = 8;

/**
 * When this profile last opened the feed, read once per visit; the visit
 * itself then becomes the new "last". Browser storage, so it is per device —
 * a convenience for the "new" marks, nothing depends on it.
 */
function useLastSeen(): number | null {
  const [lastSeen] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem(pkey(LAST_SEEN_KEY));
      const value = raw === null ? NaN : Number(raw);
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(pkey(LAST_SEEN_KEY), String(Date.now()));
    } catch {
      // Private window or blocked storage: no "new" marks next time, that's all.
    }
  }, []);
  return lastSeen;
}

/**
 * Everything from who this profile follows, as a social feed: avatars of who
 * you follow across the top, then one column of posts — the video front and
 * centre, the usual actions under it — with a sidebar on wide screens.
 *
 * Keys: J and K move between posts, L favourites, Enter plays.
 */
export function FeedPage() {
  const search = routeApi.useSearch();
  const { watched, order, performerId, studioId } = search;
  const filter: FeedFilter = {
    unwatchedOnly: watched === "false",
    order: order === "added" ? "added" : "released",
    performerId,
    studioId,
  };
  const narrowed = performerId !== undefined || studioId !== undefined;
  const navigate = useNavigate();
  const lastSeen = useLastSeen();
  const [open, setOpen] = useState<{ id: number; autoPlay: boolean } | null>(null);
  const { setFollowed } = useFollowToggle();

  const feed = useInfiniteQuery({
    queryKey: qk.mediaItems.followingFeed(filter),
    queryFn: ({ pageParam }) => fetchFeed(pageParam, filter),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  const items = useMemo(() => feed.data?.pages.flatMap((page) => page.items) ?? [], [feed.data]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;

  const { data: following } = useQuery({ queryKey: qk.following.list, queryFn: fetchFollowing });
  const followsNobody = following && following.performers.length === 0 && following.studios.length === 0;
  const narrowedTo = narrowed
    ? performerId !== undefined
      ? following?.performers.find((p) => p.id === performerId)?.name
      : following?.studios.find((s) => s.id === studioId)?.name
    : undefined;

  // Autoplay, as a social feed does it: the post most in view plays its
  // preview, muted, and only that one. Held to the same rules as the hover
  // previews everywhere else — off with previews off, in discreet mode, or
  // when the app or the OS asks for less motion.
  const { hoverPreview, discreet, motion } = useAppearance();
  const osReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const previewsAllowed = hoverPreview && !discreet;
  const autoplay = previewsAllowed && motion === "full" && !osReducedMotion;
  const visibility = useRef(new Map<number, number>());
  const [inView, setInView] = useState<number | null>(null);
  const reportVisibility = useCallback((id: number, ratio: number) => {
    if (ratio > 0) visibility.current.set(id, ratio);
    else visibility.current.delete(id);
    let best: number | null = null;
    let bestRatio = AUTOPLAY_MIN_VISIBLE;
    for (const [candidate, candidateRatio] of visibility.current) {
      if (candidateRatio > bestRatio) {
        best = candidate;
        bestRatio = candidateRatio;
      }
    }
    setInView(best);
  }, []);
  // Nothing plays behind the player.
  const playingId = autoplay && open === null ? inView : null;

  // The ⋯ menu: the same menu a tile has everywhere else, plus unfollowing
  // whoever put this post in the feed.
  const { menu, setMenu, openMenu } = useTileMenu({ onEdit: (id) => setOpen({ id, autoPlay: false }) });
  const onMenu = useCallback(
    (event: React.MouseEvent, item: FeedItem) => {
      openMenu(event, item);
      const reasons = [
        ...item.because.performers.map((p) => ({ kind: "performer" as const, id: p.id, name: p.name })),
        ...(item.because.studio ? [{ kind: "studio" as const, ...item.because.studio }] : []),
      ];
      setMenu((current) =>
        current
          ? {
              ...current,
              entries: [
                ...current.entries,
                { separator: true as const },
                ...reasons.map((target) => ({
                  label: `Unfollow ${target.name}`,
                  icon: UserMinus,
                  danger: true,
                  onSelect: () => void setFollowed(target, false),
                })),
              ],
            }
          : current,
      );
    },
    [openMenu, setMenu, setFollowed],
  );

  // Keyboard: J / K pick the next or previous post, L favourites it, Enter
  // plays it. Off while the player is open or you are typing a note.
  const handles = useRef(new Map<number, PostHandle>());
  const register = useCallback((id: number, handle: PostHandle | null) => {
    if (handle) handles.current.set(id, handle);
    else handles.current.delete(id);
  }, []);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  useEffect(() => {
    if (open !== null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key !== "j" && key !== "k" && key !== "l" && key !== "enter") return;
      const index = items.findIndex((item) => item.id === selectedId);
      if (key === "j" || key === "k") {
        event.preventDefault();
        const next =
          index === -1 ? 0 : Math.max(0, Math.min(items.length - 1, index + (key === "j" ? 1 : -1)));
        const target = items[next];
        if (!target) return;
        setSelectedId(target.id);
        handles.current.get(target.id)?.node?.scrollIntoView({ block: "center", behavior: "smooth" });
        if (next >= items.length - 3 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
        return;
      }
      if (selectedId === null) return;
      // Enter on a focused button already does that button's job.
      if (key === "enter" && event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      const handle = handles.current.get(selectedId);
      if (key === "l") handle?.like();
      else handle?.play();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // Load the next page as the end of the list comes into view.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "1200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const tabSearch = { order: search.order, performerId, studioId };

  return (
    <AppShell title="Feed">
      <div className="mx-auto flex w-full max-w-[1040px] justify-center gap-8 px-0 py-4 sm:px-4 md:py-6">
        <div className="w-full min-w-0 max-w-[640px]">
          <FeedStories
            performerId={performerId}
            studioId={studioId}
            search={{ watched, order: search.order }}
          />

          <div className="mb-4 mt-3 flex items-center gap-6 border-b border-border px-4 sm:px-0">
            {[
              { label: "Latest", value: undefined },
              { label: "Unwatched", value: "false" as const },
            ].map((tab) => (
              <button
                key={tab.label}
                type="button"
                aria-pressed={watched === tab.value}
                onClick={() => void navigate({ to: "/feed", search: { ...tabSearch, watched: tab.value } })}
                className={cn(
                  "-mb-px border-b-2 py-3 text-sm font-medium transition-colors",
                  watched === tab.value
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="sr-only">Order</span>
              <select
                value={filter.order}
                onChange={(event) =>
                  void navigate({
                    to: "/feed",
                    search: {
                      watched,
                      performerId,
                      studioId,
                      order: event.target.value === "added" ? "added" : undefined,
                    },
                  })
                }
                className="cursor-pointer rounded-md bg-transparent py-1 pr-1 text-sm font-medium text-foreground outline-none hover:bg-accent"
              >
                <option value="released">Newest release</option>
                <option value="added">Recently added</option>
              </select>
            </label>
          </div>

          {narrowed && (
            <div className="mb-4 flex items-center gap-2 px-4 text-sm sm:px-0">
              <span className="text-muted-foreground">Showing</span>
              <Link
                to="/feed"
                search={{ watched, order: search.order }}
                className="sensitive flex items-center gap-1 rounded-full bg-secondary py-1 pl-3 pr-2 font-medium transition-colors hover:bg-accent"
              >
                {narrowedTo ?? "one of who you follow"}
                <X className="size-3.5" />
              </Link>
            </div>
          )}

          {feed.isPending && (
            <div className="space-y-4">
              {[0, 1].map((n) => (
                <PostSkeleton key={n} />
              ))}
            </div>
          )}
          {feed.isError && (
            <p className="py-20 text-center text-sm text-muted-foreground">The feed couldn't be loaded.</p>
          )}

          {feed.isSuccess && items.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-4 py-24 text-center">
              <div className="flex size-16 items-center justify-center rounded-full border-2 border-border">
                <Rss className="size-7 text-muted-foreground" />
              </div>
              {followsNobody ? (
                <>
                  <p className="text-lg font-semibold">Your feed is empty</p>
                  <p className="max-w-xs text-sm text-muted-foreground">
                    Follow performers and studios and their new videos show up here.
                  </p>
                  <Link
                    to="/following"
                    className="mt-2 rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
                  >
                    Find people to follow
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold">
                    {filter.unwatchedOnly ? "You're all caught up" : "Nothing here yet"}
                  </p>
                  <p className="max-w-xs text-sm text-muted-foreground">
                    {filter.unwatchedOnly
                      ? "You've watched everything here."
                      : "New videos from who you follow will show up here."}
                  </p>
                </>
              )}
            </div>
          )}

          <div className="space-y-4">
            {items.map((item, index) => (
              <Fragment key={item.id}>
                {index === SUGGESTIONS_AFTER && !narrowed && <FeedSuggestions />}
                <FeedPost
                  item={item}
                  isNew={arrivedSince(item.createdAt, lastSeen)}
                  selected={selectedId === item.id}
                  playing={playingId === item.id}
                  hoverPreview={previewsAllowed && !autoplay}
                  onVisibility={reportVisibility}
                  onOpen={(autoPlay) => {
                    setSelectedId(item.id);
                    setOpen({ id: item.id, autoPlay });
                  }}
                  onMenu={onMenu}
                  register={register}
                />
              </Fragment>
            ))}
          </div>

          <div ref={sentinel} />
          {isFetchingNextPage && (
            <div className="flex justify-center py-6">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {feed.isSuccess && items.length > 0 && !hasNextPage && (
            <p className="py-10 text-center text-xs text-muted-foreground">You've reached the end.</p>
          )}
        </div>

        {/* Wide screens only, held in view under the app's header as you scroll. */}
        <aside className="hidden w-[320px] shrink-0 lg:block">
          <div className="scrollbar-hide sticky top-[76px] max-h-[calc(100vh-92px)] overflow-y-auto">
            <FeedSidebar />
          </div>
        </aside>
      </div>

      <ContextMenu state={menu} onClose={() => setMenu(null)} />
      {open !== null && (
        <MediaDetailModal itemId={open.id} autoPlay={open.autoPlay} onClose={() => setOpen(null)} />
      )}
    </AppShell>
  );
}
