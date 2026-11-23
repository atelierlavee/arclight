// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { PreviewClip } from "../PreviewClip";
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
import { fetchStudios, randomStudioFrame, studioFrameUrl, type StudioSummary } from "@/lib/studioApi";
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

/** Each poster's resting tilt and drop, so the wall looks hung by hand. */
const POSTER_TILT = [
  { rotate: -6, y: 10 },
  { rotate: 3, y: -8 },
  { rotate: -2.5, y: 14 },
  { rotate: 5, y: -4 },
];

/**
 * The library's categories as movie posters on a wall: tall frames side by
 * side, tilted and overlapping a little as if pinned up by hand. Hovering
 * one straightens it and lifts it forward; a click opens Browse there.
 * Empty categories keep their poster, greyed, so the library's shape is clear.
 */
export function LibraryScene() {
  const { data } = useQuery({ queryKey: qk.categories, queryFn: fetchCategories });
  const categories = data?.categories ?? [];
  if (categories.length < 2) return null;

  const coverOf = (index: number) => {
    const category = categories[index];
    if (category.cover) return `${category.cover}&e=${IMAGE_EPOCH}`;
    return category.representativeItemId != null ? thumbnailUrl({ id: category.representativeItemId }) : null;
  };

  return (
    <section className="relative isolate -mx-4 overflow-hidden px-6 py-16 md:-mx-6 md:px-14 md:py-24">
      {/* The Studios heading's silk, here wide and faint behind the wall:
          the pink runs out to the left from the box on the right, so the
          ribbons cross the whole scene. */}
      <SilkWaves className="absolute right-0 top-1/2 -z-10 h-[75%] w-[45%] -translate-y-1/2 opacity-50" />

      <div className="mb-12 flex justify-center md:mb-16">
        <Kicker>In the library</Kicker>
      </div>

      <ul className="grid grid-cols-2 justify-items-center gap-6 sm:flex sm:justify-center sm:gap-0">
        {categories.map((category, index) => {
          const tilt = POSTER_TILT[index % POSTER_TILT.length];
          const empty = category.total === 0;
          const cover = coverOf(index);
          return (
            <li
              key={category.slug}
              // The tilt lives in custom properties so hover can override it
              // from CSS alone: transform-only, so it stays smooth.
              style={{ "--tilt": `${tilt.rotate}deg`, "--drop": `${tilt.y}px` } as React.CSSProperties}
              className="relative z-0 w-full max-w-[15rem] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] [transform:rotate(var(--tilt))_translateY(var(--drop))] will-change-transform hover:z-10 hover:[transform:rotate(0deg)_translateY(-18px)_scale(1.06)] sm:w-[min(22vw,15rem)] sm:[&:not(:first-child)]:-ml-6"
            >
              <Link
                to="/browse"
                search={{ kind: category.slug }}
                className="group relative block aspect-[2/3] overflow-hidden rounded-sm bg-secondary shadow-[0_24px_50px_-18px_rgba(0,0,0,0.9)] ring-1 ring-white/10 transition-shadow duration-500 hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.95)] hover:ring-primary/60"
              >
                {cover && (
                  <img
                    src={cover}
                    alt=""
                    loading="lazy"
                    style={{
                      objectPosition: `${category.coverPositionX}% ${category.coverPositionY}%`,
                      transform: `scale(${category.coverScale / 100})`,
                      transformOrigin: `${category.coverPositionX}% ${category.coverPositionY}%`,
                    }}
                    className={cn(
                      // Black and white at rest; colour comes up on hover.
                      "sensitive absolute inset-0 size-full object-cover grayscale transition-[filter] duration-500 group-hover:grayscale-0",
                    )}
                  />
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/40" />
                {/* Poster furniture: the count up top, the title below. */}
                <span className="absolute inset-x-0 top-0 p-4 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-white/70">
                  {empty ? "Coming soon" : `${category.total.toLocaleString()} titles`}
                </span>
                <span className="absolute inset-x-0 bottom-0 p-4 text-center md:p-5">
                  <span className="block text-base font-semibold uppercase leading-none tracking-[0.3em] text-white md:text-lg">
                    {category.label}
                  </span>
                  <span className="mx-auto mt-3 block h-px w-10 bg-primary transition-all duration-500 group-hover:w-20" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The silk's canvas, in its own units. */
const SILK_W = 600;
const SILK_H = 300;

/**
 * One ribbon of silk as many fine lines: each a wave, the waves shifting
 * step by step from one shape to another, so together they twist like
 * fabric. Worked out once, at load, since it never changes.
 */
function silkRibbon(
  lines: number,
  from: { amp: number; phase: number; offset: number },
  to: { amp: number; phase: number; offset: number },
  width = SILK_W,
  waves = 1.15,
): string[] {
  const out: string[] = [];
  for (let line = 0; line < lines; line++) {
    const t = line / (lines - 1);
    const amp = from.amp + (to.amp - from.amp) * t;
    const phase = from.phase + (to.phase - from.phase) * t;
    const offset = from.offset + (to.offset - from.offset) * t;
    let d = "";
    for (let x = 0; x <= width; x += 8) {
      const u = x / width;
      // Swells in the middle and eases off at the ends.
      const swell = 0.55 + 0.45 * Math.sin(u * Math.PI);
      const y = SILK_H / 2 + offset + amp * swell * Math.sin(u * Math.PI * 2 * waves + phase);
      d += `${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)} `;
    }
    out.push(d);
  }
  return out;
}

/** The pink ribbon runs this many times the box's width, out to the left. */
const PINK_REACH = 2.2;
const SILK_PINK = silkRibbon(
  46,
  { amp: 70, phase: 0, offset: -10 },
  { amp: 40, phase: 1.6, offset: 20 },
  SILK_W * PINK_REACH,
  1.15 * PINK_REACH,
);
const SILK_VIOLET = silkRibbon(36, { amp: 55, phase: 2.4, offset: 10 }, { amp: 85, phase: 3.6, offset: -15 });

// The same ribbons a moment later in their sway: phase moved on, the twist
// a little different. Each line morphs to its twin and back, so the silk
// moves like fabric in a draught. Same number of points, so they morph cleanly.
const SILK_PINK_SWAY = silkRibbon(
  46,
  { amp: 58, phase: 0.9, offset: 0 },
  { amp: 52, phase: 2.3, offset: 10 },
  SILK_W * PINK_REACH,
  1.15 * PINK_REACH,
);
const SILK_VIOLET_SWAY = silkRibbon(
  36,
  { amp: 68, phase: 3.1, offset: 0 },
  { amp: 70, phase: 4.5, offset: -5 },
);

/** An eased there-and-back for a path's shape. */
function Sway({ from, to, seconds }: { from: string; to: string; seconds: number }) {
  return (
    <animate
      attributeName="d"
      values={`${from};${to};${from}`}
      keyTimes="0;0.5;1"
      calcMode="spline"
      keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
      dur={`${seconds}s`}
      repeatCount="indefinite"
    />
  );
}

/**
 * Two ribbons of silk — pink and violet — drawn as fine lines twisting past
 * each other, fading in from the left so they rise out of the words beside
 * them. Purely decorative.
 */
export function SilkWaves({ className }: { className?: string }) {
  const { motion } = useAppearance();
  const osReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const animated = motion === "full" && !osReducedMotion;
  return (
    <div aria-hidden className={cn("pointer-events-none relative", className)}>
      {/* Pink runs long, out to the left behind the words, fading in. */}
      <svg
        viewBox={`0 0 ${SILK_W * PINK_REACH} ${SILK_H}`}
        preserveAspectRatio="none"
        fill="none"
        className="absolute right-0 top-0 h-full"
        style={{ width: `${PINK_REACH * 100}%` }}
      >
        <defs>
          <linearGradient id="silk-pink" x1="0" x2="1">
            <stop offset="0" stopColor="#ff2d95" stopOpacity="0" />
            <stop offset="0.35" stopColor="#ff2d95" />
            <stop offset="1" stopColor="#ff7ac0" />
          </linearGradient>
        </defs>
        {SILK_PINK.map((d, index) => (
          <path key={index} d={d} stroke="url(#silk-pink)" strokeWidth="0.8" opacity="0.55">
            {animated && <Sway from={d} to={SILK_PINK_SWAY[index]} seconds={9} />}
          </path>
        ))}
      </svg>
      {/* Violet stays within the box. */}
      <svg
        viewBox={`0 0 ${SILK_W} ${SILK_H}`}
        preserveAspectRatio="none"
        fill="none"
        className="absolute inset-0 size-full"
      >
        <defs>
          <linearGradient id="silk-violet" x1="0" x2="1">
            <stop offset="0" stopColor="#b026ff" stopOpacity="0" />
            <stop offset="0.35" stopColor="#b026ff" />
            <stop offset="1" stopColor="#7b2cff" />
          </linearGradient>
        </defs>
        {SILK_VIOLET.map((d, index) => (
          <path key={index} d={d} stroke="url(#silk-violet)" strokeWidth="0.8" opacity="0.45">
            {animated && <Sway from={d} to={SILK_VIOLET_SWAY[index]} seconds={7} />}
          </path>
        ))}
      </svg>
    </div>
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
      <div className="pointer-events-none absolute inset-0 bg-black/80" />

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

/** How many channels the control room has. */
/** How many channels scroll past on the wall. */
const CHANNELS = 16;

/** Scanlines over a screen: fine dark lines, as on a monitor. */
const SCANLINES =
  "repeating-linear-gradient(to bottom, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 1px, transparent 1px, transparent 3px)";

/**
 * The studios as a broadcast control room: a wall of small screens, one per
 * studio, each showing a still with its channel number, and a main monitor
 * playing whichever channel is selected. Hovering a screen switches the main
 * monitor to it. Only the main monitor plays, so the wall stays light.
 */
export function StudiosScene() {
  const { hoverPreview, discreet, motion } = useAppearance();
  const osReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const previews = hoverPreview && !discreet;
  const { data } = useQuery({ queryKey: qk.studios.all, queryFn: fetchStudios });
  const channels = [...(data?.studios ?? [])]
    .filter(
      (studio) =>
        studio.videoCount > 0 && (studio.frameItemIds.length > 0 || studio.representativeItemId != null),
    )
    .sort(
      (a, b) => Number(b.isFollowed ?? false) - Number(a.isFollowed ?? false) || b.videoCount - a.videoCount,
    )
    .slice(0, CHANNELS);
  const [tunedId, setTunedId] = useState<number | null>(null);
  // A random still per studio, picked once per visit.
  const [covers] = useState(() => new Map<number, number | null>());
  const coverOf = (studio: StudioSummary) => {
    if (!covers.has(studio.id)) covers.set(studio.id, randomStudioFrame(studio));
    return covers.get(studio.id) ?? null;
  };
  if (channels.length < 2) return null;

  const tunedIndex = Math.max(
    0,
    channels.findIndex((studio) => studio.id === tunedId),
  );
  const tuned = channels[tunedIndex];
  const tunedCover = coverOf(tuned);
  // Rolls only when there are enough channels to fill a column, and motion is welcome.
  const rolling = motion === "full" && !osReducedMotion && channels.length >= 6;
  const channelNumber = (index: number) => `CH ${String(index + 1).padStart(2, "0")}`;

  return (
    <section className="relative -mx-4 overflow-hidden px-6 py-14 md:-mx-6 md:px-14 md:py-16">
      <div className="mb-8 flex items-center gap-8">
        <div className="relative z-10 shrink-0 space-y-3">
          <Kicker>The studios</Kicker>
          <p className="max-w-2xl text-2xl font-black leading-tight tracking-tight md:text-3xl">
            Irresistible women. <span className="text-primary">Untamed fantasies.</span>
          </p>
          <p className="max-w-2xl text-muted-foreground">
            Discover the studios creating seductive performances, breathtaking beauty, and fantasies worth
            exploring.
          </p>
          <Link
            to="/studios"
            className="flex w-fit items-center gap-2 pt-1 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
          >
            All studios
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <SilkWaves className="ml-auto hidden h-64 w-full min-w-0 max-w-lg md:block" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        {/* The main monitor: the tuned channel, playing. */}
        {/* The monitor sets the row's height; the wall beside it fills that. */}
        <div className="rounded-xl bg-[#0b0b0d] p-2 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10">
          <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
            {tunedCover != null && (
              <img
                key={`still-${tuned.id}`}
                src={studioFrameUrl(tuned, tunedCover)}
                alt=""
                className="sensitive animate-fade-in absolute inset-0 size-full object-cover"
              />
            )}
            {previews && tunedCover != null && <PreviewClip key={`clip-${tuned.id}`} itemId={tunedCover} />}
            <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: SCANLINES }} />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.6)_100%)]" />

            <span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-sm bg-red-600 px-2 py-0.5 text-[11px] font-black uppercase tracking-widest text-white">
              <span className="size-1.5 animate-pulse rounded-full bg-white" />
              Live
            </span>
            <span className="absolute right-4 top-4 font-mono text-sm font-bold tracking-widest text-white/80">
              {channelNumber(tunedIndex)}
            </span>

            <div
              key={`caption-${tuned.id}`}
              className="animate-fade-in absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 bg-gradient-to-t from-black/85 to-transparent p-5 md:p-6"
            >
              <div>
                <p className="text-3xl font-black uppercase tracking-tight text-white md:text-5xl">
                  {tuned.name}
                </p>
                <p className="mt-1 text-sm text-white/70">
                  {tuned.videoCount} {tuned.videoCount === 1 ? "video" : "videos"}
                </p>
              </div>
              <Link
                to="/studio/$studioId"
                params={{ studioId: String(tuned.id) }}
                className="flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-bold text-black transition-transform hover:scale-[1.04]"
              >
                Open studio
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* The wall of channels: two columns rolling in opposite directions,
            left down and right up, inside a window exactly the monitor's
            height. Each column is drawn twice, so moving by half its height
            loops without a seam. Hovering a column holds that column still. */}
        <div className="relative h-[420px] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_92%,transparent)] lg:h-auto">
          <div
            className={cn(
              "grid grid-cols-2 gap-3",
              rolling ? "absolute inset-0" : "h-full overflow-y-auto scrollbar-hide",
            )}
          >
            {[0, 1].map((column) => {
              const list = channels
                .map((studio, index) => ({ studio, index }))
                .filter((_, position) => position % 2 === column);
              const track = (copy: number) =>
                list.map(({ studio, index }) => (
                  <ChannelTile
                    key={`${copy}:${studio.id}`}
                    studio={studio}
                    cover={coverOf(studio)}
                    number={channelNumber(index)}
                    active={studio.id === tuned.id}
                    copy={copy > 0}
                    onTune={() => setTunedId(studio.id)}
                  />
                ));
              return (
                <div key={column} className="min-w-0">
                  <div
                    className={cn(rolling && (column === 0 ? "animate-roll-down" : "animate-roll-up"))}
                    style={{ "--roll-duration": `${list.length * 5}s` } as React.CSSProperties}
                  >
                    {track(0)}
                    {rolling && track(1)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * One screen on the control room's wall: a still with scanlines, its name and
 * channel number. Spacing is padding below each tile rather than a gap, so a
 * column drawn twice is exactly twice as tall and its loop has no seam.
 */
function ChannelTile({
  studio,
  cover,
  number,
  active,
  copy,
  onTune,
}: {
  studio: StudioSummary;
  cover: number | null;
  number: string;
  active: boolean;
  copy: boolean;
  onTune: () => void;
}) {
  return (
    <div className="pb-3" aria-hidden={copy || undefined}>
      <Link
        to="/studio/$studioId"
        params={{ studioId: String(studio.id) }}
        tabIndex={copy ? -1 : undefined}
        onMouseEnter={onTune}
        onFocus={onTune}
        className={cn(
          "group block rounded-lg bg-[#0b0b0d] p-1.5 ring-1 transition-all duration-200",
          active ? "ring-primary" : "ring-white/10 hover:ring-white/30",
        )}
      >
        <span className="relative block aspect-video overflow-hidden rounded-md bg-black">
          {cover != null && (
            <img
              src={studioFrameUrl(studio, cover)}
              alt=""
              loading="lazy"
              className={cn(
                "sensitive size-full object-cover transition-all duration-300",
                active ? "brightness-100" : "brightness-50 saturate-50 group-hover:brightness-90",
              )}
            />
          )}
          <span className="pointer-events-none absolute inset-0" style={{ backgroundImage: SCANLINES }} />
          {active && (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />
          )}
        </span>
        <span className="flex items-baseline justify-between gap-2 px-1 pb-0.5 pt-1.5">
          <span
            className={cn(
              "truncate text-xs font-bold uppercase tracking-wide",
              active ? "text-primary" : "text-foreground/70",
            )}
          >
            {studio.name}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{number}</span>
        </span>
      </Link>
    </div>
  );
}
