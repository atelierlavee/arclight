import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Play } from "lucide-react";
import { useAppearance } from "@/lib/appearance";
import { fetchCategories } from "@/lib/categoryApi";
import { IMAGE_EPOCH, thumbnailUrl } from "@/lib/mediaItemApi";
import {
  fetchLatestVideos,
  performerBannerUrl,
  performerPortraitUrl,
  type PerformerSummary,
  type SharedVideo,
} from "@/lib/performerApi";
import { qk } from "@/lib/queryKeys";
import { fetchStudios } from "@/lib/studioApi";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn, formatDuration } from "@/lib/utils";

/*
 * The home page's library rows, redone as scenes to match the rest of the
 * page: no boxes in rows, but big type, one image at a time, and hover that
 * changes the whole scene. Each runs edge to edge, cancelling the page's
 * gutters.
 */

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
      <span className="h-px w-8 bg-primary/60" />
      {children}
    </p>
  );
}

/** A full-bleed image behind a scene, crossfading as it changes. */
function SceneBackdrop({ src, className }: { src: string | null; className?: string }) {
  if (!src) return null;
  return (
    <img
      key={src}
      src={src}
      alt=""
      className={cn("sensitive animate-fade-in absolute inset-0 size-full object-cover", className)}
    />
  );
}

/** The library's categories as huge words; hovering one shows its cover behind. */
export function LibraryScene() {
  const { data } = useQuery({ queryKey: qk.categories, queryFn: fetchCategories });
  const categories = (data?.categories ?? []).filter((category) => category.total > 0);
  const [hovered, setHovered] = useState<number | null>(null);
  // One category is just a link, not a scene.
  if (categories.length < 2) return null;

  const coverOf = (index: number) => {
    const category = categories[index];
    if (category.cover) return `${category.cover}&e=${IMAGE_EPOCH}`;
    return category.representativeItemId != null ? thumbnailUrl({ id: category.representativeItemId }) : null;
  };
  const shown = hovered ?? 0;

  return (
    <section className="relative -mx-4 overflow-hidden px-6 py-20 md:-mx-6 md:px-14 md:py-28">
      <SceneBackdrop
        src={coverOf(shown)}
        className={hovered === null ? "opacity-15 grayscale" : "opacity-40"}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/70 to-background/20" />
      <div className="relative space-y-6">
        <Kicker>In the library</Kicker>
        <ul className="space-y-1">
          {categories.map((category, index) => (
            <li key={category.slug}>
              <Link
                to="/browse"
                search={{ kind: category.slug }}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                className="group flex items-baseline gap-4"
              >
                <span
                  className={cn(
                    "text-5xl font-black tracking-tighter transition-colors md:text-7xl",
                    hovered === index ? "text-primary" : "text-foreground/80 group-hover:text-primary",
                  )}
                >
                  {category.label}
                </span>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {category.total.toLocaleString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** How many performers take a turn in the spotlight. */
const CAST_SIZE = 10;

/**
 * The cast, one at a time: a performer's banner fills the scene, their name
 * huge on the left with their latest videos, and a row of faces underneath
 * picks who is in the spotlight. It changes only when you pick.
 */
export function CastScene({ onOpen }: { onOpen: (id: number, autoPlay: boolean) => void }) {
  const { data } = useQuery({
    queryKey: qk.performers.all,
    queryFn: async () => {
      const res = await fetch("/api/performers");
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return (await res.json()) as { performers: PerformerSummary[] };
    },
  });
  const cast = [...(data?.performers ?? [])]
    .filter(
      (performer) =>
        performer.videoCount > 0 &&
        (performer.hasImage || performer.hasBanner || performer.representativeItemId != null),
    )
    // Who you follow first, then favourites, then by how much is theirs.
    .sort(
      (a, b) =>
        Number(b.isFollowed ?? false) - Number(a.isFollowed ?? false) ||
        Number(b.isFavorite) - Number(a.isFavorite) ||
        b.videoCount - a.videoCount,
    )
    .slice(0, CAST_SIZE);
  const [index, setIndex] = useState(0);
  // The video in the strip whose title and description show beneath it.
  const [pickedVideo, setPickedVideo] = useState<number | null>(null);

  const current = cast.length ? cast[index % cast.length] : null;
  const { data: latest } = useQuery({
    queryKey: qk.performers.latestVideos(current?.name ?? ""),
    queryFn: () => fetchLatestVideos(current!.name),
    enabled: current !== null,
    staleTime: 60_000,
  });

  if (cast.length < 2 || !current) return null;
  const star = current;
  const videos = (
    (latest ?? []) as (SharedVideo & { description?: string | null; durationSeconds?: number | null })[]
  ).slice(0, 4);
  // Falls back to the first when the pick belongs to someone no longer shown.
  const selected = videos.find((video) => video.id === pickedVideo) ?? videos[0];
  // The banner art, across the whole scene: wide pictures for a wide scene.
  // Without an uploaded banner it falls back as the profile page does, to a
  // frame from one of their videos.
  const banner = performerBannerUrl(star);
  const bannerY = (star as PerformerSummary & { bannerPositionY?: number }).bannerPositionY ?? 30;

  return (
    <section className="relative -mx-4 overflow-hidden md:-mx-6">
      {banner && (
        <img
          key={`banner-${star.id}`}
          src={banner}
          alt=""
          style={{ objectPosition: `50% ${bannerY}%` }}
          className="sensitive animate-fade-in pointer-events-none absolute inset-0 size-full object-cover"
        />
      )}
      {/* One even overlay over the whole banner, so the words read anywhere
          on it. Top and bottom are left sharp: the scene is a frame. */}
      <div className="pointer-events-none absolute inset-0 bg-black/55" />

      {/* The section's own words, which stay put while the spotlight moves. */}
      <div className="relative max-w-2xl space-y-3 px-6 pt-14 md:px-14 md:pt-16">
        <Kicker>The cast</Kicker>
        <p className="text-2xl font-black leading-tight tracking-tight md:text-3xl">
          Beauty in every curve. <span className="text-primary">Temptation in every glance.</span>
        </p>
        <p className="text-muted-foreground">
          Discover stunning performers, captivating bodies, and irresistible beauty. Find the faces and
          personalities that catch your eye.
        </p>
      </div>

      <div
        key={`words-${star.id}`}
        className="animate-fade-in relative max-w-2xl space-y-5 px-6 pb-6 pt-8 md:px-14 md:pt-10"
      >
        <div className="space-y-3">
          <h2 className="sensitive line-clamp-2 min-h-[1.8em] text-5xl font-black leading-[0.9] tracking-tighter md:text-7xl lg:text-8xl">
            {star.name}
          </h2>
          <p className="text-lg text-muted-foreground">
            {star.videoCount} {star.videoCount === 1 ? "video" : "videos"} in your library
          </p>
        </div>

        {/* Their latest, to watch straight from here. */}
        {/* Always four slots, so a performer with fewer videos doesn't
            change the scene's height as the spotlight moves on. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {videos.map((video) => (
            <button
              key={video.id}
              type="button"
              onClick={() => onOpen(video.id, true)}
              onMouseEnter={() => setPickedVideo(video.id)}
              onFocus={() => setPickedVideo(video.id)}
              aria-label={`Play ${video.title}`}
              className={cn(
                "group relative aspect-video overflow-hidden rounded-sm bg-secondary shadow-lg shadow-black/50 ring-2 transition",
                selected?.id === video.id ? "ring-primary" : "ring-transparent",
              )}
            >
              <img
                src={thumbnailUrl(video)}
                alt=""
                loading="lazy"
                className="sensitive size-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                <Play className="size-5 fill-white text-white" />
              </span>
            </button>
          ))}
          {Array.from({ length: Math.max(0, 4 - videos.length) }, (_, slot) => (
            <div key={`empty-${slot}`} aria-hidden className="aspect-video" />
          ))}
        </div>
        {/* Room for the title and two lines, whatever the video has. */}
        <div className="min-h-[4.75rem] max-w-xl">
          {selected && (
            <div key={selected.id} className="animate-fade-in space-y-1">
              <p className="sensitive truncate text-base font-bold leading-snug">
                {selected.title}
                {formatDuration(selected.durationSeconds ?? null) && (
                  <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
                    {formatDuration(selected.durationSeconds ?? null)}
                  </span>
                )}
              </p>
              {selected.description ? (
                <p className="sensitive line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  {selected.description}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground/60">No description yet.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/performer/$performerId"
            params={{ performerId: String(star.id) }}
            className="flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition-transform hover:scale-[1.04]"
          >
            See their page
            <ArrowRight className="size-4" />
          </Link>
          <Link
            to="/performers"
            className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-foreground/90 ring-1 ring-border transition-colors hover:bg-white/10"
          >
            Everyone
          </Link>
        </div>
      </div>

      {/* The faces: who else is in the cast, and a way to pick them. */}
      <div className="relative flex gap-3 overflow-x-auto px-6 pb-10 pt-2 scrollbar-hide md:px-14 md:pb-12">
        {cast.map((performer, position) => {
          const src = performerPortraitUrl(performer);
          const active = position === index % cast.length;
          return (
            <button
              key={performer.id}
              type="button"
              onClick={() => setIndex(position)}
              aria-label={`Show ${performer.name}`}
              aria-pressed={active}
              title={performer.name}
              className={cn(
                "size-12 shrink-0 overflow-hidden rounded-full bg-secondary ring-2 transition-all duration-300 md:size-14",
                active ? "scale-110 ring-primary" : "opacity-50 ring-transparent hover:opacity-100",
              )}
            >
              {src && (
                <img
                  src={src}
                  alt=""
                  loading="lazy"
                  style={{ objectPosition: `${performer.imagePositionX}% ${performer.imagePositionY}%` }}
                  className="sensitive size-full object-cover"
                />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** How many studios are in the deck. */
const DECK_SIZE = 8;
/** How long the top card takes to fly off. */
const DEAL_MS = 320;

/** Where each card of the visible stack sits: the top first. */
const STACK = [
  "z-30 translate-x-0 translate-y-0 rotate-0 scale-100 opacity-100",
  "z-20 translate-x-6 -translate-y-3 rotate-[4deg] scale-[0.96] opacity-90",
  "z-10 translate-x-12 -translate-y-6 rotate-[8deg] scale-[0.92] opacity-70",
  "z-0 translate-x-16 -translate-y-8 rotate-[11deg] scale-[0.88] opacity-40",
];

/**
 * The studios as a deck of cards: their stills stacked and fanned on the
 * right, the top card's studio named large on the left. "Next" deals the top
 * card away and the rest move up; the top card opens its studio. Arrow keys
 * deal too while the pointer is over the scene.
 */
export function StudiosScene() {
  const { motion } = useAppearance();
  const osReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const animated = motion === "full" && !osReducedMotion;
  const { data } = useQuery({ queryKey: qk.studios.all, queryFn: fetchStudios });
  const deck = [...(data?.studios ?? [])]
    .filter(
      (studio) =>
        studio.videoCount > 0 && (studio.frameItemIds.length > 0 || studio.representativeItemId != null),
    )
    .sort(
      (a, b) => Number(b.isFollowed ?? false) - Number(a.isFollowed ?? false) || b.videoCount - a.videoCount,
    )
    .slice(0, DECK_SIZE);
  const [top, setTop] = useState(0);
  const [dealing, setDealing] = useState(false);
  if (deck.length < 2) return null;

  const at = (offset: number) => deck[(top + offset + deck.length) % deck.length];
  const current = at(0);

  function step(direction: 1 | -1) {
    if (dealing) return;
    if (direction === -1 || !animated) {
      setTop((value) => (value + direction + deck.length) % deck.length);
      return;
    }
    // Fly the top card off, then bring the next one up.
    setDealing(true);
    window.setTimeout(() => {
      setTop((value) => (value + 1) % deck.length);
      setDealing(false);
    }, DEAL_MS);
  }

  const visible = Math.min(STACK.length, deck.length);

  return (
    <section
      className="relative -mx-4 overflow-hidden px-6 py-14 md:-mx-6 md:px-14 md:py-16"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") step(1);
        if (event.key === "ArrowLeft") step(-1);
      }}
      onMouseEnter={(event) => event.currentTarget.focus({ preventScroll: true })}
    >
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div key={current.id} className="animate-fade-in space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Kicker>The studios</Kicker>
            <Link
              to="/studios"
              className="flex items-center gap-2 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
            >
              All studios
              <ArrowRight className="size-4" />
            </Link>
          </div>
          <h2 className="truncate text-5xl font-black uppercase leading-[0.9] tracking-tighter md:text-7xl">
            {current.name}
          </h2>
          <p className="text-lg text-muted-foreground">
            {current.videoCount} {current.videoCount === 1 ? "video" : "videos"} in your library
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              to="/studio/$studioId"
              params={{ studioId: String(current.id) }}
              className="flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition-transform hover:scale-[1.04]"
            >
              Open studio
              <ArrowRight className="size-4" />
            </Link>
            <div className="ml-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous studio"
                className="flex size-10 items-center justify-center rounded-full ring-1 ring-border transition-colors hover:bg-white/10"
              >
                <ArrowRight className="size-4 rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next studio"
                className="flex size-10 items-center justify-center rounded-full ring-1 ring-border transition-colors hover:bg-white/10"
              >
                <ArrowRight className="size-4" />
              </button>
              <span className="ml-1 font-mono text-sm tabular-nums text-muted-foreground">
                {String((top % deck.length) + 1).padStart(2, "0")} / {String(deck.length).padStart(2, "0")}
              </span>
            </div>
          </div>
        </div>

        {/* The deck. Cards keep their keys as they move up, so each glides
            to its new place rather than being redrawn there. */}
        <div className="relative mx-auto aspect-video w-full max-w-xl">
          {Array.from({ length: visible }, (_, offset) => {
            const studio = at(offset);
            const stillId = studio.frameItemIds[0] ?? studio.representativeItemId;
            const flying = dealing && offset === 0;
            return (
              <Link
                key={studio.id}
                to="/studio/$studioId"
                params={{ studioId: String(studio.id) }}
                tabIndex={offset === 0 ? undefined : -1}
                aria-label={offset === 0 ? `Open ${studio.name}` : undefined}
                aria-hidden={offset === 0 ? undefined : true}
                className={cn(
                  "absolute inset-0 overflow-hidden rounded-md bg-secondary shadow-[0_30px_60px_-15px_rgba(0,0,0,0.85)] ring-1 ring-white/10",
                  animated && "transition-all duration-300 ease-out",
                  flying ? "z-40 -translate-x-[120%] -rotate-12 opacity-0" : STACK[offset],
                  offset > 0 && "pointer-events-none",
                )}
              >
                {stillId != null && (
                  <img
                    src={thumbnailUrl({ id: stillId })}
                    alt=""
                    loading="lazy"
                    className="sensitive size-full object-cover"
                  />
                )}
                {offset === 0 && (
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-left text-xs font-semibold uppercase tracking-[0.25em] text-white/80">
                    {studio.name}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
