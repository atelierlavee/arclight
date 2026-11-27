// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  Check,
  Columns2,
  GitCommitVertical,
  Grid2x2,
  Heart,
  ImagePlus,
  LayoutGrid,
  List,
  ListVideo,
  Loader2,
  MoreHorizontal,
  Move,
  Play,
  RefreshCw,
  Rows3,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { FramingEditor, type FramingValue } from "@/components/FramingEditor";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { PerformerContinueWatching } from "@/components/PerformerContinueWatching";
import { AlbumRow } from "@/components/AlbumRow";
import { PerformerCareer } from "@/components/PerformerCareer";
import { PerformerSeries } from "@/components/PerformerSeries";
import { fetchSeries } from "@/lib/seriesApi";
import { PerformerFacts } from "@/components/PerformerFacts";
import { StashDbLookupDialog } from "@/components/StashDbLookupDialog";
import { fetchStashDbStatus } from "@/lib/stashdbApi";
import { FollowButton } from "@/components/FollowButton";
import { PerformerImageMenu } from "@/components/PerformerImageMenu";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import {
  fetchPerformer,
  performerBannerUrl,
  performerPortraitUrl,
  circleFraming,
  circleStyle,
  type PerformerDetail,
  saveCircleFraming,
  deletePerformerImage,
  saveBannerPosition,
  uploadPerformerImage,
  savePortraitFraming,
  setPerformerArchived,
  setPerformerFavorite,
  setPerformerFollowed,
} from "@/lib/performerApi";
import { useToast } from "@/lib/toast";
import { qk } from "@/lib/queryKeys";
import { openDetails, openWatchPage } from "@/lib/appEvents";
import { invalidatePerformer } from "@/lib/invalidate";
import { useIsOwner } from "@/lib/profile";
import { useAppearance, BANNER_VH } from "@/lib/appearance";
import { framingStyle, thumbnailUrl } from "@/lib/mediaItemApi";
import { cn, formatDuration } from "@/lib/utils";
import type { MediaCardItem } from "@/components/MediaCard";
import { PreviewClip } from "@/components/PreviewClip";
import { PerformerCard } from "@/components/PerformerCard";

const routeApi = getRouteApi("/performer/$performerId");

type PageOfItems = { items: MediaCardItem[]; hasMore: boolean; page: number };

async function fetchGridPage(
  performer: string,
  studio: string | null,
  page: number,
  sort = "released",
): Promise<PageOfItems> {
  const params = new URLSearchParams({ performer, sort, type: "video", page: String(page) });
  if (studio) params.set("studio", studio);
  const res = await fetch(`/api/media-items?${params}`);
  if (!res.ok) throw new Error(`Failed to load videos: ${res.status}`);
  return res.json();
}

/** How the list can be ordered, within each studio. */
const WALL_SORTS = [
  { key: "released", label: "Newest" },
  { key: "played", label: "Most played" },
  { key: "longest", label: "Longest" },
] as const;
type WallSort = (typeof WALL_SORTS)[number]["key"];

/**
 * How each video shows: cinema rows in one column or two, or tiles in a
 * grid. Two columns to start.
 */
type VideoMode = "list1" | "list" | "grid";
const ModeContext = createContext<VideoMode>("list");
/** A video as a tile: its still, with title and studio · year over it. */
function VideoTile({
  item,
  showStudio,
  onSelect,
}: {
  item: MediaCardItem;
  showStudio: boolean;
  onSelect: (id: number, autoPlay: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id, false)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={item.title}
      className="group relative aspect-video overflow-hidden rounded-sm bg-secondary ring-1 ring-white/5 transition-all duration-300 hover:shadow-[0_0_30px_-8px_rgba(255,45,149,0.55)] hover:ring-primary/60"
    >
      <img
        src={thumbnailUrl(item)}
        alt=""
        loading="lazy"
        style={framingStyle(item)}
        className="sensitive size-full object-cover"
      />
      <StillClip itemId={item.id} hovered={hovered} />
      <span className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/15 to-transparent p-2.5 text-left md:p-3">
        <span className="sensitive line-clamp-2 text-xs font-semibold leading-snug text-white md:text-sm">
          {item.title}
        </span>
        <span className="sensitive mt-0.5 truncate text-[11px] text-white/65">
          {[showStudio ? item.studio : null, item.releaseDate?.slice(0, 4)].filter(Boolean).join(" · ")}
        </span>
      </span>
      {item.durationSeconds ? (
        <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-sm bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          <Play className="size-2.5 fill-current" />
          {formatDuration(item.durationSeconds)}
        </span>
      ) : null}
    </button>
  );
}

/** A run of videos in whichever mode is chosen: rows in two columns, or a grid of tiles. */
function VideoList({
  items,
  showStudio = false,
  columns = "wide",
  onSelect,
}: {
  items: MediaCardItem[];
  showStudio?: boolean;
  /** "wide" for the full width; "half" for one side of the timeline. */
  columns?: "wide" | "half";
  onSelect: (id: number, autoPlay: boolean) => void;
}) {
  const mode = useContext(ModeContext);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  if (mode === "grid") {
    return (
      <div
        className={cn(
          "grid gap-2",
          columns === "wide" ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-4" : "grid-cols-2",
        )}
      >
        {items.map((item) => (
          <VideoTile key={item.id} item={item} showStudio={showStudio} onSelect={onSelect} />
        ))}
      </div>
    );
  }
  return (
    <ol
      className={cn(
        "grid gap-x-10",
        // Two columns, unless one was asked for (or it's one side of the timeline).
        columns === "wide" && mode === "list" && "lg:grid-cols-2",
        mode === "list1" && "mx-auto max-w-4xl",
      )}
    >
      {items.map((item) => (
        <CinemaRow
          key={item.id}
          item={item}
          showStudio={showStudio}
          playing={hoveredId === item.id}
          onHover={setHoveredId}
          onSelect={onSelect}
        />
      ))}
    </ol>
  );
}

/** "Play all": every still in the videos section plays its clip while on screen. */
const WallContext = createContext(false);
const WALL_KEY = "performer-video-wall";

function readWall(): boolean {
  try {
    return localStorage.getItem(WALL_KEY) === "on";
  } catch {
    return false;
  }
}

/**
 * A still's clip: on hover as ever, or — with "Play all" on — whenever the
 * still is on screen. Only those in view play, so a long list doesn't start
 * a hundred videos at once. Never in discreet mode.
 */
function StillClip({ itemId, hovered }: { itemId: number; hovered: boolean }) {
  const wall = useContext(WallContext);
  const { hoverPreview, discreet } = useAppearance();
  const ref = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || !wall) return;
    const observer = new IntersectionObserver((entries) => setInView(entries[0]?.isIntersecting ?? false), {
      rootMargin: "100px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [wall]);
  const play = !discreet && ((wall && inView) || (hoverPreview && hovered));
  return (
    <span ref={ref} className="absolute inset-0">
      {play && <PreviewClip itemId={itemId} />}
    </span>
  );
}

/** How many of a studio's videos show before "Show more". */
const GROUP_FIRST = 6;

/** One video as a wide row: still left (its clip on hover), title and details right. */
function CinemaRow({
  item,
  playing,
  onHover,
  onSelect,
  showStudio = false,
}: {
  item: MediaCardItem;
  /** With no studio heading above, the row names its studio itself. */
  showStudio?: boolean;
  playing: boolean;
  onHover: (id: number | null) => void;
  onSelect: (id: number, autoPlay: boolean) => void;
}) {
  return (
    <li className="border-b border-white/5">
      <button
        type="button"
        onClick={() => onSelect(item.id, false)}
        onMouseEnter={() => onHover(item.id)}
        onMouseLeave={() => onHover(null)}
        className="group flex w-full items-start gap-4 py-4 text-left md:gap-5"
      >
        <span className="relative block aspect-video w-40 shrink-0 overflow-hidden rounded-sm bg-secondary ring-1 ring-white/5 transition-all duration-300 group-hover:shadow-[0_0_30px_-8px_rgba(255,45,149,0.55)] group-hover:ring-primary/60 sm:w-52 xl:w-60">
          <img
            src={thumbnailUrl(item)}
            alt=""
            loading="lazy"
            style={framingStyle(item)}
            className="sensitive size-full object-cover"
          />
          <StillClip itemId={item.id} hovered={playing} />
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
            <span className="flex size-10 items-center justify-center rounded-full bg-white/95 text-black shadow-lg">
              <Play className="ml-0.5 size-4 fill-current" />
            </span>
          </span>
        </span>
        <span className="min-w-0 flex-1 space-y-1.5 pt-0.5">
          <span className="sensitive line-clamp-2 text-base font-bold leading-snug transition-colors group-hover:text-primary md:text-lg">
            {item.title}
          </span>
          <span className="sensitive block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {[
              showStudio ? item.studio : null,
              item.releaseDate?.slice(0, 4),
              formatDuration(item.durationSeconds),
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </span>
          {item.description && (
            <span className="sensitive line-clamp-2 text-xs leading-relaxed text-white/60">
              {item.description}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/**
 * One studio's videos with this performer: the studio's name as a big
 * label down its left edge, then the first few as cinema rows in two
 * columns, and "Show more" for the rest, a page at a time.
 */
function StudioGroup({
  performer,
  studio,
  sort,
  onSelect,
}: {
  performer: PerformerDetail;
  studio: string;
  sort: WallSort;
  onSelect: (id: number, autoPlay: boolean) => void;
}) {
  const mode = useContext(ModeContext);
  const [expanded, setExpanded] = useState(false);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: qk.performerVideos.list(performer.name, { group: studio }, sort),
    queryFn: ({ pageParam }) => fetchGridPage(performer.name, studio, pageParam, sort),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    placeholderData: (previous) => previous,
  });
  const all = (data?.pages ?? []).flatMap((page) => page.items).filter((item) => item.itemType === "video");
  const shown = expanded ? all : all.slice(0, GROUP_FIRST);
  const more = expanded ? hasNextPage : all.length > GROUP_FIRST || hasNextPage;

  return (
    <section
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)] gap-5 md:gap-8",
        // One column: the label and its list centred together, close up.
        mode === "list1" && "mx-auto max-w-5xl",
      )}
    >
      {/* The studio's name, running down the left edge of its group. */}
      <div className="flex flex-col items-center gap-3 border-r border-primary/30 pr-4 md:pr-6">
        <h3 className="sensitive sticky top-24 rotate-180 whitespace-nowrap text-xs font-bold uppercase tracking-[0.3em] text-primary [writing-mode:vertical-rl] md:text-[15px]">
          {studio}
        </h3>
      </div>
      <div className="min-w-0 space-y-3">
        <VideoList items={shown} onSelect={onSelect} />
        {more && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => {
                if (!expanded) setExpanded(true);
                else void fetchNextPage();
              }}
              disabled={isFetchingNextPage}
              className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
            >
              {isFetchingNextPage ? "Loading…" : `Show more from ${studio}`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/** How the All view can be ordered. */
const ALL_SORTS = [
  { key: "released", label: "Newest" },
  { key: "releasedOldest", label: "Oldest" },
  { key: "newest", label: "Recently added" },
  { key: "played", label: "Most played" },
  { key: "rating", label: "Top rated" },
  { key: "longest", label: "Longest" },
  { key: "shortest", label: "Shortest" },
  { key: "title", label: "A–Z" },
] as const;
type AllSort = (typeof ALL_SORTS)[number]["key"];

/**
 * Every video with no grouping at all, in the order you pick (newest
 * release first to start), more loading as you reach the bottom.
 */
function AllVideos({
  performer,
  onSelect,
}: {
  performer: PerformerDetail;
  onSelect: (id: number, autoPlay: boolean) => void;
}) {
  const [sort, setSort] = useState<AllSort>("released");
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: qk.performerVideos.list(performer.name, { all: true }, sort),
    queryFn: ({ pageParam }) => fetchGridPage(performer.name, null, pageParam, sort),
    placeholderData: (previous) => previous,
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  const items = (data?.pages ?? []).flatMap((page) => page.items).filter((item) => item.itemType === "video");

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) return <div className="skeleton h-64 rounded-sm" />;
  return (
    <div className="space-y-6">
      {/* The order. */}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        {ALL_SORTS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setSort(option.key)}
            aria-pressed={sort === option.key}
            className={cn(
              "relative pb-1 text-xs font-semibold uppercase tracking-[0.25em] transition-colors",
              sort === option.key ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            <span
              className={cn(
                "absolute inset-x-0 bottom-0 h-px bg-primary transition-opacity",
                sort === option.key ? "opacity-100" : "opacity-0",
              )}
            />
          </button>
        ))}
      </div>
      <VideoList items={items} showStudio onSelect={onSelect} />
      <div ref={sentinel} className="h-10" />
      {isFetchingNextPage && <p className="text-center text-xs text-muted-foreground">Loading more…</p>}
    </div>
  );
}

/** Which way the videos section is laid out. Every visit opens By studio. */
type VideoView = "all" | "grid" | "timeline" | "series";

/**
 * Every video on one line down the middle of the page, newest first: each
 * year set vertically on the line, its videos to one side — the next year's
 * to the other — each a row of still, title, studio · length, description. More load as you reach
 * the bottom. Hovering a still plays its clip.
 */
function VideoTimeline({
  performer,
  onSelect,
}: {
  performer: PerformerDetail;
  onSelect: (id: number, autoPlay: boolean) => void;
}) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: qk.performerVideos.list(performer.name, { timeline: true }, "released"),
    queryFn: ({ pageParam }) => fetchGridPage(performer.name, null, pageParam, "released"),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  const items = (data?.pages ?? []).flatMap((page) => page.items).filter((item) => item.itemType === "video");

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) return <div className="skeleton mx-auto h-64 max-w-4xl rounded-sm" />;

  // Runs of videos sharing a release year, in order.
  const years: { year: string | null; items: MediaCardItem[] }[] = [];
  for (const item of items) {
    const year = item.releaseDate?.slice(0, 4) ?? null;
    const last = years[years.length - 1];
    if (last && last.year === year) last.items.push(item);
    else years.push({ year, items: [item] });
  }

  return (
    <div className="relative mx-auto max-w-6xl">
      {/* The line, down the middle (down the left on a phone). */}
      <span
        aria-hidden
        className="absolute bottom-0 left-4 top-0 w-px bg-gradient-to-b from-primary/60 via-primary/30 to-transparent md:left-1/2"
      />
      <ol className="space-y-12">
        {years.map((group, groupIndex) => {
          // Each year's videos take the other side from the year before.
          const left = groupIndex % 2 === 0;
          return (
            <li
              key={`${group.year}-${groupIndex}`}
              className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] md:gap-10"
            >
              {/* Where one year ends and the next begins: a small hollow ring
                  threaded on the line. */}
              {groupIndex > 0 && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -top-6 left-4 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background md:left-1/2"
                />
              )}
              {/* The year, set vertically on the far side of the line from its
                  videos, close up against the line. */}
              <div
                className={cn(
                  "flex justify-center md:row-start-1",
                  left ? "md:col-start-3 md:justify-start" : "md:col-start-1 md:justify-end",
                )}
              >
                <span className="sticky top-24 h-fit rotate-180 whitespace-nowrap py-3 text-xs font-bold uppercase tabular-nums tracking-[0.3em] text-primary [writing-mode:vertical-rl] md:text-[15px]">
                  {group.year ?? "Undated"}
                </span>
              </div>
              {/* Its videos, all on one side of the line. */}
              <div
                className={cn("min-w-0 space-y-1 md:row-start-1", left ? "md:col-start-1" : "md:col-start-3")}
              >
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id, false)}
                    onMouseEnter={() => setHoveredId(item.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={cn(
                      "group flex w-full items-start gap-4 py-2.5 text-left",
                      // On the left side, the still sits nearest the line.
                      left && "md:flex-row-reverse md:text-right",
                    )}
                  >
                    <span className="relative block aspect-video w-36 shrink-0 overflow-hidden rounded-sm bg-secondary ring-1 ring-white/5 transition-all duration-300 group-hover:shadow-[0_0_30px_-8px_rgba(255,45,149,0.55)] group-hover:ring-primary/60 md:w-44">
                      <img
                        src={thumbnailUrl(item)}
                        alt=""
                        loading="lazy"
                        style={framingStyle(item)}
                        className="sensitive size-full object-cover"
                      />
                      <StillClip itemId={item.id} hovered={hoveredId === item.id} />
                    </span>
                    <span className="min-w-0 flex-1 space-y-1 pt-0.5">
                      <span className="sensitive line-clamp-2 text-base font-bold leading-snug transition-colors group-hover:text-primary">
                        {item.title}
                      </span>
                      <span className="sensitive block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        {[item.studio, formatDuration(item.durationSeconds)].filter(Boolean).join("  ·  ")}
                      </span>
                      {item.description && (
                        <span className="sensitive line-clamp-1 text-xs text-white/60">
                          {item.description}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
      <div ref={sentinel} className="h-10" />
      {isFetchingNextPage && <p className="text-center text-xs text-muted-foreground">Loading more…</p>}
    </div>
  );
}

/**
 * Their videos, in either of two layouts you can switch between: grouped by
 * studio (each with its name down the side, newest first), or one timeline.
 */
function FeaturedWall({
  performer,
  onSelect,
}: {
  performer: PerformerDetail;
  onSelect: (id: number, autoPlay: boolean) => void;
}) {
  const sort: WallSort = "released";
  const [chosenView, setView] = useState<VideoView>("grid");
  // The series they are in, for the Series view — offered only when there
  // are some, and falling back to studios if they disappear.
  const { data: seriesData } = useQuery({
    queryKey: qk.series.byPerformer(performer.id),
    queryFn: () => fetchSeries(performer.id),
  });
  const hasSeries = (seriesData?.series.length ?? 0) > 0;
  const view: VideoView = chosenView === "series" && !hasSeries ? "grid" : chosenView;
  const [wall, setWallState] = useState(readWall);
  // Every visit opens on two columns; switching lasts for the visit.
  const [mode, setMode] = useState<VideoMode>("list");
  const setWall = (next: boolean) => {
    setWallState(next);
    try {
      localStorage.setItem(WALL_KEY, next ? "on" : "off");
    } catch {
      // A private window: the choice just isn't remembered.
    }
  };
  const studios = performer.studios
    .filter((studio): studio is { name: string; count: number } => studio.name !== null)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  if (performer.videoCount === 0) return null;
  return (
    <section className="space-y-12">
      <div className="space-y-3 text-center">
        <p className="flex items-center justify-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
          <span className="h-px w-8 bg-primary/60" />
          Videos
          <span className="h-px w-8 bg-primary/60" />
        </p>
        <h2 className="text-2xl font-black tracking-tight md:text-3xl">
          Their hottest scenes. Your favourite <span className="text-primary">fantasies</span>.
        </h2>
        <p className="text-sm text-muted-foreground">All in one place.</p>
        {/* The layout, and whether every still plays. */}
        <div className="flex flex-wrap items-center justify-center gap-5 pt-2">
          <div className="flex rounded-full bg-secondary p-0.5" role="group" aria-label="Layout">
            {(
              [
                { key: "all", label: "All", icon: List },
                { key: "grid", label: "By studio", icon: LayoutGrid },
                { key: "timeline", label: "Timeline", icon: GitCommitVertical },
                ...(hasSeries ? [{ key: "series", label: "Series", icon: ListVideo }] : []),
              ] as { key: VideoView; label: string; icon: typeof List }[]
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-pressed={view === key}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  view === key ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
            <span aria-hidden className="mx-1 my-1.5 w-px bg-white/15" />
            <button
              type="button"
              onClick={() => setWall(!wall)}
              aria-pressed={wall}
              aria-label={wall ? "Stop playing all previews" : "Play all previews"}
              title={wall ? "Stop playing all previews" : "Play all previews"}
              className={cn(
                "flex items-center rounded-full px-3 py-1 transition-colors",
                wall ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Sparkles className="size-3.5" />
            </button>
          </div>
          {view !== "timeline" && view !== "series" && (
            <div className="flex rounded-full bg-secondary p-0.5" role="group" aria-label="View mode">
              {(
                [
                  { key: "list1", label: "List, one column", icon: Rows3 },
                  { key: "list", label: "List, two columns", icon: Columns2 },
                  { key: "grid", label: "Grid", icon: Grid2x2 },
                ] as const
              ).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  aria-pressed={mode === key}
                  aria-label={label}
                  title={label}
                  className={cn(
                    "flex items-center rounded-full px-3 py-1 transition-colors",
                    mode === key ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <ModeContext.Provider value={mode}>
        <WallContext.Provider value={wall}>
          {view === "series" ? (
            <PerformerSeries performerId={performer.id} name={performer.name} bare />
          ) : view === "all" ? (
            <AllVideos performer={performer} onSelect={onSelect} />
          ) : view === "timeline" ? (
            <VideoTimeline performer={performer} onSelect={onSelect} />
          ) : (
            studios.map((studio) => (
              <StudioGroup
                key={studio.name}
                performer={performer}
                studio={studio.name}
                sort={sort}
                onSelect={onSelect}
              />
            ))
          )}
        </WallContext.Provider>
      </ModeContext.Provider>
    </section>
  );
}

/**
 * Who they appear with most: a small centred heading, then the co-stars as
 * small performer cards in one row that scrolls sideways. A click opens
 * their page.
 */
function OftenWith({ performer }: { performer: PerformerDetail }) {
  const navigate = useNavigate();
  const stars = performer.coPerformers.slice(0, 30);
  const top = stars[0];
  if (!top) return null;
  return (
    <section className="space-y-8">
      <div className="space-y-3 text-center">
        <p className="flex items-center justify-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
          <span className="h-px w-8 bg-primary/60" />
          Often with
          <span className="h-px w-8 bg-primary/60" />
        </p>
        <h2 className="text-2xl font-black tracking-tight md:text-3xl">
          Great chemistry gets <span className="text-primary">dirty</span>.
        </h2>
        <p className="text-sm text-muted-foreground">
          Meet the co-stars behind their hottest on-screen encounters.
        </p>
      </div>
      <div className="scrollbar-hide -mx-6 flex gap-4 overflow-x-auto px-6 pb-2 md:-mx-14 md:px-14">
        {stars.map((star) => (
          <PerformerCard
            key={star.id}
            performer={star}
            mono
            small
            onClick={() =>
              void navigate({ to: "/performer/$performerId", params: { performerId: String(star.id) } })
            }
          />
        ))}
      </div>
    </section>
  );
}

/**
 * The owner's setup tools for this performer, tucked into one "⋯" menu in
 * the header's corner: their cover (add or change, reposition, remove) and
 * archiving. Nothing a viewer needs, so nothing on show.
 */
function OwnerMenu({
  performer,
  onReposition,
  onArchive,
}: {
  performer: PerformerDetail;
  onReposition: () => void;
  onArchive: (next: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const failed = (title: string) => (error: unknown) =>
    toast({ title, description: error instanceof Error ? error.message : undefined, variant: "error" });
  const upload = useMutation({
    mutationFn: (file: File) => uploadPerformerImage(performer.id, "banner", file),
    onSuccess: () => {
      invalidatePerformer(queryClient, performer.id);
      // A new cover is exactly when you know where you want it.
      onReposition();
    },
    onError: failed("Could not upload the cover"),
  });
  const remove = useMutation({
    mutationFn: () => deletePerformerImage(performer.id, "banner"),
    onSuccess: () => invalidatePerformer(queryClient, performer.id),
    onError: failed("Could not remove the cover"),
  });

  const item =
    "flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50";
  return (
    <div ref={menuRef} className="absolute right-4 top-20 z-30 md:right-6">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload.mutate(file);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More"
        title="More"
        className="flex size-9 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
      >
        {upload.isPending || remove.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <MoreHorizontal className="size-5" />
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-52 rounded-md border border-border bg-popover p-1 text-left shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              fileRef.current?.click();
            }}
          >
            <ImagePlus className="size-4 text-muted-foreground" />
            {performer.hasBanner ? "Change cover" : "Add cover"}
          </button>
          {performer.hasBanner && (
            <>
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => {
                  setOpen(false);
                  onReposition();
                }}
              >
                <Move className="size-4 text-muted-foreground" />
                Reposition cover
              </button>
              <button
                type="button"
                role="menuitem"
                className={cn(item, "hover:text-destructive")}
                onClick={() => {
                  setOpen(false);
                  remove.mutate();
                }}
              >
                <Trash2 className="size-4 text-muted-foreground" />
                Remove cover
              </button>
            </>
          )}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onArchive(!performer.archivedAt);
            }}
          >
            {performer.archivedAt ? (
              <ArchiveRestore className="size-4 text-muted-foreground" />
            ) : (
              <Archive className="size-4 text-muted-foreground" />
            )}
            {performer.archivedAt ? "Restore performer" : "Archive performer"}
          </button>
        </div>
      )}
    </div>
  );
}

export function PerformerPage() {
  const { performerId } = routeApi.useParams();
  const id = Number(performerId);
  // Which crop is being adjusted: the tiles' 2:3, or the round picture here.
  const [reframing, setReframing] = useState<"tile" | "circle" | null>(null);
  const [syncing, setSyncing] = useState(false);
  // The cover's position while you drag it; null when not repositioning.
  const [bannerDraft, setBannerDraft] = useState<number | null>(null);
  const bannerDrag = useRef<{ startY: number; start: number; height: number } | null>(null);
  const openItem = (id: number, autoPlay: boolean) => {
    if (autoPlay) openWatchPage(id);
    else openDetails(id);
  };
  const queryClient = useQueryClient();

  const saveFraming = useMutation({
    mutationFn: (next: FramingValue) =>
      savePortraitFraming(id, {
        imagePositionX: next.x,
        imagePositionY: next.y,
        imageScale: next.scale,
      }),
    onSuccess: () => {
      // The cards on the performers page and the home row show the same
      // portrait, so they have to repaint too.
      invalidatePerformer(queryClient, id);
      setReframing(null);
    },
  });

  const saveCircle = useMutation({
    mutationFn: (next: FramingValue | null) =>
      saveCircleFraming(
        id,
        next && { avatarPositionX: next.x, avatarPositionY: next.y, avatarScale: next.scale },
      ),
    onSuccess: () => {
      // Everywhere else a round picture of them appears.
      invalidatePerformer(queryClient, id);
      setReframing(null);
    },
  });

  const favorite = useMutation({
    mutationFn: (next: boolean) => setPerformerFavorite(id, next),
    onSuccess: () => {
      // The performers page pins favourites to the top, so its list has to
      // re-sort too.
      invalidatePerformer(queryClient, id);
    },
  });

  const { toast } = useToast();
  const saveBanner = useMutation({
    mutationFn: (value: number) => saveBannerPosition(id, value),
    onSuccess: () => {
      invalidatePerformer(queryClient, id);
      setBannerDraft(null);
    },
    onError: (error) =>
      toast({
        title: "Could not save the cover's position",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      }),
  });
  const isOwner = useIsOwner();
  // The sync button needs a StashDB key; only the owner is ever asked.
  const { data: stashDb } = useQuery({
    queryKey: qk.stashDbStatus,
    queryFn: fetchStashDbStatus,
    enabled: isOwner,
  });
  const archive = useMutation({
    mutationFn: (next: boolean) => setPerformerArchived(id, next),
    onSuccess: (_, next) => {
      // The grid, the home row and the network all leave archived
      // performers out, and all sit under this prefix.
      invalidatePerformer(queryClient, id);
      toast({
        title: next ? "Archived" : "Restored",
        description: next
          ? "Out of the home row, search and the network. Their videos are untouched."
          : "Back on the performers page.",
      });
    },
    onError: (error) =>
      toast({
        title: "Could not update archive",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "error",
      }),
  });

  const { data: performer, isError } = useQuery({
    queryKey: qk.performer.detail(id),
    queryFn: () => fetchPerformer(id),
  });

  if (isError) {
    return (
      <AppShell title="Performer not found">
        <p className="px-4 text-sm text-muted-foreground md:px-6">
          That performer doesn’t exist — it may have been deleted.
        </p>
      </AppShell>
    );
  }

  // Same resolver the homepage row and the modal use, so all three show the
  // same face for a given performer.
  const avatarSrc = performer ? performerPortraitUrl(performer) : null;

  return (
    <AppShell>
      {performer && (
        // Relative, so the breadcrumbs sit within the page rather than over
        // the sidebar.
        <div className="relative pb-24">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-4 pt-4 md:px-6">
            <Breadcrumbs
              overlay
              items={[{ label: "Performers", to: "/performers" }, { label: performer.name }]}
            />
          </div>
          {/* The stage: their picture under a spotlight, the name beneath. */}
          <header
            // At least 80% of the screen with a cover, so it has room to be
            // seen; taller if the details need it.
            style={{ minHeight: performer.hasBanner ? `${BANNER_VH}vh` : undefined }}
            className="relative isolate flex flex-col items-center justify-center gap-6 overflow-hidden px-6 pb-16 pt-24 text-center md:pt-28"
          >
            {/* Their banner, when one is set: behind the whole header, darkened
                and fading into the page, so everything over it stays readable. */}
            {performer.hasBanner && (
              <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
                <img
                  src={performerBannerUrl(performer) ?? undefined}
                  alt=""
                  style={{ objectPosition: `50% ${bannerDraft ?? performer.bannerPositionY}%` }}
                  className="sensitive size-full object-cover grayscale"
                />
                <div
                  className={cn(
                    "absolute inset-0 transition-colors",
                    bannerDraft === null ? "bg-black/60" : "bg-black/10",
                  )}
                />
                {bannerDraft === null && (
                  <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-transparent to-background" />
                )}
              </div>
            )}
            {isOwner && (
              <OwnerMenu
                performer={performer}
                onReposition={() => setBannerDraft(performer.bannerPositionY)}
                onArchive={(next) => archive.mutate(next)}
              />
            )}
            {/* Repositioning the cover: drag anywhere over the header. */}
            {bannerDraft !== null && (
              <div
                className="absolute inset-0 z-20 cursor-grab touch-none active:cursor-grabbing"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  bannerDrag.current = {
                    startY: event.clientY,
                    start: bannerDraft,
                    height: event.currentTarget.clientHeight,
                  };
                }}
                onPointerMove={(event) => {
                  const drag = bannerDrag.current;
                  if (!drag) return;
                  // Dragging down shows more of the top: the position goes down.
                  const moved = ((event.clientY - drag.startY) / drag.height) * 100;
                  setBannerDraft(Math.round(Math.min(100, Math.max(0, drag.start - moved))));
                }}
                onPointerUp={() => {
                  bannerDrag.current = null;
                }}
              >
                <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-white/70" />
                <div className="absolute left-1/2 top-20 flex -translate-x-1/2 items-center gap-2">
                  <span className="pointer-events-none rounded-full bg-black/70 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
                    Drag to reposition the cover
                  </span>
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => saveBanner.mutate(bannerDraft)}
                    disabled={saveBanner.isPending}
                    className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
                  >
                    <Check className="size-3.5" />
                    Save
                  </button>
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => setBannerDraft(null)}
                    aria-label="Cancel"
                    className="flex size-7 items-center justify-center rounded-full bg-black/70 text-white"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>
            )}
            <div className="group relative">
              <div className="size-44 overflow-hidden rounded-full bg-secondary shadow-[0_0_90px_-10px_rgba(255,45,149,0.6)] ring-1 ring-primary/50 md:size-56">
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt=""
                    style={circleStyle(performer)}
                    className="sensitive size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-5xl font-black text-muted-foreground">
                    {performer.name.trim()[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
              </div>
              {isOwner && (
                <PerformerImageMenu
                  performerId={performer.id}
                  kind="avatar"
                  hasImage={performer.hasImage}
                  canReposition={Boolean(avatarSrc)}
                  onReposition={() => setReframing("tile")}
                  onRepositionCircle={() => setReframing("circle")}
                  onUploaded={() => setReframing("tile")}
                  className="bottom-3 right-3"
                />
              )}
            </div>

            <div className="relative flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <h1
                className="sensitive text-5xl font-black uppercase leading-none tracking-tight text-transparent md:text-8xl"
                style={{ WebkitTextStroke: "1.5px var(--primary)" }}
              >
                {performer.name}
              </h1>
            </div>

            {performer.archivedAt && (
              <div className="relative flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-medium">
                  <Archive className="size-3" />
                  Archived
                </span>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => archive.mutate(false)}
                    disabled={archive.isPending}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-foreground hover:bg-secondary disabled:opacity-50"
                  >
                    <ArchiveRestore className="size-3" />
                    Restore
                  </button>
                )}
              </div>
            )}

            {/* About them, right under the picture. */}
            <div className="relative -mt-1 w-full max-w-3xl border-t border-white/10 pt-5">
              <PerformerFacts performer={performer} />
            </div>

            {/* Favourite and follow, under the details. */}
            <div className="relative flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => favorite.mutate(!performer.isFavorite)}
                disabled={favorite.isPending}
                aria-pressed={performer.isFavorite}
                aria-label={performer.isFavorite ? "Remove from favourites" : "Add to favourites"}
                title={performer.isFavorite ? "Remove from favourites" : "Add to favourites"}
                className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-50"
              >
                <Heart className={performer.isFavorite ? "size-5 fill-primary text-primary" : "size-5"} />
              </button>
              <FollowButton
                iconOnly
                followed={performer.followedAt !== null}
                name={performer.name}
                onToggle={async (next) => {
                  await setPerformerFollowed(performer.id, next);
                  invalidatePerformer(queryClient, performer.id);
                }}
              />
              {isOwner && stashDb?.configured && (
                <button
                  type="button"
                  onClick={() => setSyncing(true)}
                  aria-label="Sync details from StashDB"
                  title="Sync details from StashDB"
                  className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                >
                  <RefreshCw className="size-5" />
                </button>
              )}
            </div>
            {syncing && <StashDbLookupDialog performer={performer} onClose={() => setSyncing(false)} />}

            {reframing === "circle" && avatarSrc && (
              <div className="relative w-full max-w-xs space-y-1.5 text-left">
                <FramingEditor
                  key={`${performer.avatarPositionX}-${performer.avatarPositionY}-${performer.avatarScale}`}
                  src={avatarSrc}
                  value={{
                    x: circleFraming(performer).imagePositionX ?? 50,
                    y: circleFraming(performer).imagePositionY ?? 0,
                    scale: circleFraming(performer).imageScale ?? 100,
                  }}
                  aspectClass="aspect-square"
                  round
                  saving={saveCircle.isPending}
                  onSave={(next) => saveCircle.mutate(next)}
                  onCancel={() => setReframing(null)}
                  note="Used for the round picture here, in a video's details, in search and in the network graph. The tiles keep their own framing."
                />
                {performer.avatarPositionX != null && (
                  <button
                    type="button"
                    onClick={() => saveCircle.mutate(null)}
                    disabled={saveCircle.isPending}
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
                  >
                    Match the tiles again
                  </button>
                )}
              </div>
            )}
            {reframing === "tile" && avatarSrc && (
              <div className="relative w-full max-w-xs text-left">
                <FramingEditor
                  src={avatarSrc}
                  value={{
                    x: performer.imagePositionX,
                    y: performer.imagePositionY,
                    scale: performer.imageScale,
                  }}
                  aspectClass="aspect-[2/3]"
                  saving={saveFraming.isPending}
                  onSave={(next) => saveFraming.mutate(next)}
                  onCancel={() => setReframing(null)}
                  note="Used for the tiles on the performers page, the home row and elsewhere. The round picture has its own framing."
                />
              </div>
            )}
          </header>

          {/* The wall: every video. Then, quietly, the rest. */}
          <div className="space-y-20 px-6 md:px-14">
            <div className="mx-auto max-w-5xl">
              <PerformerCareer performerId={performer.id} onSelect={openItem} />
            </div>

            {performer.coPerformers.length > 0 && <OftenWith performer={performer} />}

            <PerformerContinueWatching performer={performer} onSelect={openItem} />

            <FeaturedWall performer={performer} onSelect={openItem} />

            <AlbumRow performer={performer.name} />
          </div>
        </div>
      )}

    </AppShell>
  );
}
