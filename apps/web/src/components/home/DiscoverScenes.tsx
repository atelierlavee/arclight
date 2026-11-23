// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play, Shuffle } from "lucide-react";
import type { MediaCardItem } from "../MediaCard";
import { PreviewClip } from "../PreviewClip";
import { framingStyle, thumbnailUrl } from "@/lib/mediaItemApi";
import { qk } from "@/lib/queryKeys";
import { cn, formatDuration } from "@/lib/utils";

type Open = (id: number, autoPlay: boolean) => void;

function Kicker({ n, label }: { n: string; label: string }) {
  return (
    <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
      <span className="font-mono tabular-nums text-muted-foreground">{n}</span>
      <span className="h-px w-8 bg-primary/60" />
      {label}
    </p>
  );
}

/** How many moods to offer, and how many videos each deals. */
const MOODS = 8;
const MOOD_PICKS = 4;

const newSeed = () => Math.floor(Math.random() * 1_000_000);

/** A line under each mood, chosen by its name so a mood always says the same thing. */
const TAGLINES = [
  "Slow, close and very, very warm.",
  "Turn the lights down. Turn it up.",
  "Exactly what you came here for.",
  "No rush. No limits. No regrets.",
  "The kind of night you don’t tell anyone about.",
  "Bold, bare and impossible to look away from.",
  "Some cravings don’t wait.",
  "Soft hands. Hard to forget.",
  "Give in. You know you want to.",
  "Heat that lingers long after the credits.",
  "Tonight, indulge a little more.",
  "Dangerously easy to lose an hour in.",
];

/** Lines written for particular moods, by name in lower case. */
const MOOD_TAGLINES: Record<string, string> = {
  blowjob: "Dirty lips. Filthy fantasies.",
  missionary: "Classic position. No innocent intentions.",
  "doggy style": "Raw passion. Wild intentions.",
  "reverse cowgirl": "Take the reins. Ride wild.",
  facial: "Messy moments. Zero apologies.",
  "pussy licking": "Slow teasing. Wicked pleasure.",
  "brown hair": "Sweet looks. Naughty desires.",
  riding: "Take control. Ride hard.",
};

function taglineFor(name: string): string {
  const own =
    MOOD_TAGLINES[
      name
        .toLowerCase()
        .replace(/[-_\s]+/g, " ")
        .trim()
    ];
  if (own) return own;
  let hash = 0;
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TAGLINES[hash % TAGLINES.length];
}

/** The last two of something that changes: the current one, and the one it replaced. */
function useLastTwo<T extends { id: number }>(current: T | undefined): T[] {
  const [pair, setPair] = useState<T[]>(current ? [current] : []);
  if (current && pair[pair.length - 1]?.id !== current.id) setPair([...pair.slice(-1), current]);
  return pair;
}

/**
 * A size that fits the word across its scene: huge for a short one, scaled
 * down for a long one so it never runs off the sides. In container units, so
 * it is the scene's width that counts, not the window's.
 */
function fitted(word: string): string {
  // A heavy capital, tightly tracked, is about 0.72em wide on average.
  return `min(15cqw, calc(92cqw / ${Math.max(word.length, 1) * 0.72}))`;
}

/** The mood word, poster-size: the new one rising in, the one it replaced leaving. */
function PosterWords({
  words,
  className,
  style,
}: {
  words: { id: number; name: string }[];
  className: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className="grid place-items-center">
      {words.map((word, index) => (
        <span
          key={word.id}
          aria-hidden={index < words.length - 1}
          className={cn(
            "sensitive whitespace-nowrap text-center font-black uppercase leading-none tracking-[-0.04em] [grid-area:1/1]",
            index < words.length - 1 ? "animate-word-out" : "animate-word-in",
            className,
          )}
          style={{ ...style, fontSize: fitted(word.name) }}
        >
          {word.name}
        </span>
      ))}
    </div>
  );
}

/**
 * "What's the mood tonight?" as a movie poster: the mood (one of your
 * biggest tags) set enormous across the full width, with one of its videos
 * seen through the letters — bright inside them, barely there around them.
 * Its clip plays while you hover. Changing the mood or dealing another fades
 * one scene into the next. The other moods run small along the bottom.
 */
export function MoodPicker({
  tags,
  chapter,
  onOpen,
  preview,
}: {
  tags: { id: number; name: string; itemCount?: number }[];
  chapter: string;
  onOpen: Open;
  preview: boolean;
}) {
  const moods = [...tags]
    .filter((tag) => (tag.itemCount ?? 0) > 0)
    .sort((a, b) => (b.itemCount ?? 0) - (a.itemCount ?? 0))
    .slice(0, MOODS);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [seed, setSeed] = useState(newSeed);
  const [shown, setShown] = useState(0);
  const [hovering, setHovering] = useState(false);
  const mood = moods.find((tag) => tag.id === pickedId) ?? moods[0];

  const { data, isFetching } = useQuery({
    queryKey: qk.mediaItems.mood(mood?.name ?? "", seed),
    queryFn: async () => {
      const params = new URLSearchParams({
        type: "video",
        tag: mood!.name,
        sort: "random",
        seed: String(seed),
      });
      const res = await fetch(`/api/media-items?${params}`);
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return ((await res.json()) as { items: MediaCardItem[] }).items
        .filter((item) => item.itemType === "video")
        .slice(0, MOOD_PICKS);
    },
    enabled: mood !== undefined,
    placeholderData: (previous) => previous,
  });

  const picks = data ?? [];
  const feature = picks[shown % Math.max(picks.length, 1)];
  const scenes = useLastTwo(feature);
  const words = useLastTwo(mood);

  if (moods.length < 3 || !mood) return null;

  function another() {
    // Through this mood's four, then a fresh four.
    if (shown + 1 < picks.length) setShown(shown + 1);
    else {
      setShown(0);
      setSeed(newSeed());
    }
  }

  return (
    <section
      className="relative isolate flex h-[80vh] min-h-[560px] flex-col overflow-hidden bg-black [container-type:inline-size]"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* The scene, at full brightness; a click opens it. Each new one
          fades in over the last. */}
      {feature && (
        <button
          type="button"
          onClick={() => onOpen(feature.id, false)}
          aria-label={feature.title}
          className="absolute inset-0 overflow-hidden"
        >
          {scenes.map((scene, index) => (
            <div
              key={scene.id}
              className={cn("absolute inset-0", index === scenes.length - 1 && "animate-scene-in")}
            >
              <img
                src={thumbnailUrl(scene)}
                alt=""
                style={framingStyle(scene)}
                className="sensitive size-full object-cover animate-ken-burns"
              />
            </div>
          ))}
          {preview && hovering && <PreviewClip key={feature.id} itemId={feature.id} />}
        </button>
      )}

      {/* The mask: near-black everywhere but the letters, which are white,
          so multiplying lets the scene through only inside the word. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden bg-[rgb(46,40,48)] mix-blend-multiply [container-type:inline-size]">
        <PosterWords words={words} className="text-white" />
      </div>
      {/* A fine pink edge to the letters, over the mask. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden [container-type:inline-size]">
        <PosterWords
          words={words}
          className="text-transparent"
          style={{ WebkitTextStroke: "1px color-mix(in oklab, var(--primary) 70%, transparent)" }}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-background to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-background via-background/70 to-transparent" />
      <div className="film-grain pointer-events-none absolute inset-0" />

      {/* Another video in this mood: through its four, then a fresh four. */}
      <button
        type="button"
        onClick={another}
        aria-label="Another video"
        title="Another video"
        className="absolute right-6 top-16 z-10 flex size-10 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white md:right-14 md:top-20"
      >
        <Shuffle className={cn("size-5", isFetching && "animate-spin")} />
      </button>

      <div className="pointer-events-none relative px-6 pt-16 md:px-14 md:pt-20">
        <Kicker n={chapter} label="Pick a mood" />
        <p className="mt-2 text-lg font-semibold text-white/70">What’s the mood tonight?</p>
      </div>

      {/* The mood's line, tucked just under the word (which sits at the
          scene's middle, its size fitted to its length), so the two read
          as one title. */}
      <div className="pointer-events-none flex-1">
        <p
          key={mood.id}
          className="absolute inset-x-0 px-6 text-center text-sm font-semibold uppercase tracking-[0.4em] text-white/85 animate-word-in md:text-base"
          style={{ top: `calc(50% + ${fitted(mood.name)} / 2 + 1.25rem)` }}
        >
          {/* Set like a title card: the first sentence white, the rest pink. */}
          {(() => {
            const [first, ...rest] = taglineFor(mood.name).split(/(?<=\.)\s+/);
            return (
              <>
                {first}
                {rest.length > 0 && <span className="text-primary"> {rest.join(" ")}</span>}
              </>
            );
          })()}
        </p>
      </div>

      {/* The moods, on one centred line. */}
      <div className="relative flex justify-center px-6 pb-10 md:px-14 md:pb-12">
        <div className="flex max-w-full gap-x-6 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
          {moods.map((tag) => {
            const active = tag.id === mood.id;
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setPickedId(tag.id);
                  setShown(0);
                }}
                className={cn(
                  "sensitive relative shrink-0 pb-1 text-xs font-semibold uppercase tracking-[0.25em] transition-colors",
                  active ? "text-primary" : "text-white/45 hover:text-white",
                )}
              >
                {tag.name}
                <span
                  className={cn(
                    "absolute bottom-0 left-0 h-px bg-primary transition-all duration-300",
                    active ? "w-full" : "w-0",
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** How many related videos branch off. */
const RELATED_SHOWN = 4;

/**
 * Where each related video sits: one size for all, staggered a little in a
 * regular zig-zag so they read as branching rather than as a stacked column.
 */
const STAGGER = [0, 48, 16, 64];
const STILL_WIDTH = 220;

/**
 * Why a related video is here, in a few words: the performers it shares with
 * the one you watched, or failing that, that it is tagged alike.
 */
function relatedBecause(source: MediaCardItem, video: MediaCardItem): string {
  const sourceIds = new Set((source.performers ?? []).map((performer) => performer.id));
  const shared = (video.performers ?? []).filter((performer) => sourceIds.has(performer.id));
  if (shared.length > 0) {
    return `Same performer · ${shared
      .slice(0, 2)
      .map((performer) => performer.name)
      .join(", ")}`;
  }
  return "Similar tags";
}

type Branch = { d: string };

/**
 * "Because you watched …" as a connected chain: the video you watched on the
 * left, glowing lines branching from it to four related videos scattered on
 * the right (the same performers first, then shared tags). The lines are
 * measured from where each video actually sits, so they always land on it.
 * Hovering one lights its branch, with light running along it.
 */
export function BecauseYouWatched({
  item,
  chapter,
  onOpen,
  preview,
}: {
  item: MediaCardItem;
  chapter: string;
  onOpen: Open;
  preview: boolean;
}) {
  const { data } = useQuery({
    queryKey: qk.relatedItems.forItem(item.id),
    queryFn: async () => {
      const res = await fetch(`/api/media-items/${item.id}/related`);
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return (await res.json()) as { items: MediaCardItem[] };
    },
  });
  const [hovered, setHovered] = useState<number | null>(null);
  const [sourceHovered, setSourceHovered] = useState(false);
  const related = (data?.items ?? []).filter((video) => video.itemType === "video").slice(0, RELATED_SHOWN);

  // Measure where the source and each still really are, and draw a curve
  // between them; again whenever anything changes size.
  const areaRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLButtonElement>(null);
  const stillRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const area = areaRef.current;
    const source = sourceRef.current;
    if (!area || !source) return;
    const draw = () => {
      const box = area.getBoundingClientRect();
      const from = source.getBoundingClientRect();
      const x0 = from.right - box.left;
      const y0 = from.top + from.height / 2 - box.top;
      setSize({ width: box.width, height: box.height });
      setBranches(
        stillRefs.current.slice(0, related.length).map((still) => {
          if (!still) return { d: "" };
          const to = still.getBoundingClientRect();
          const x1 = to.left - box.left;
          const y1 = to.top + to.height / 2 - box.top;
          const bend = (x1 - x0) * 0.5;
          return { d: `M${x0} ${y0} C ${x0 + bend} ${y0}, ${x1 - bend} ${y1}, ${x1} ${y1}` };
        }),
      );
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(area);
    return () => observer.disconnect();
  }, [related.length]);

  if (related.length === 0) return null;

  return (
    <section className="relative px-6 py-14 md:px-14 md:py-16">
      <div className="mb-8 space-y-2">
        <Kicker n={chapter} label="More like this" />
        <h2 className="text-3xl font-black tracking-tight md:text-4xl">
          Because you watched <span className="sensitive text-primary">{item.title}</span>
        </h2>
      </div>

      <div
        ref={areaRef}
        className="relative grid items-center gap-6 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-24"
      >
        {/* The branches, drawn over the whole area from measured points. */}
        <svg
          aria-hidden
          width={size.width}
          height={size.height}
          className="pointer-events-none absolute inset-0 hidden md:block"
          fill="none"
        >
          <defs>
            <linearGradient id="chain-line" x1="0" x2="1">
              <stop offset="0" stopColor="#ff2d95" />
              <stop offset="1" stopColor="#b026ff" />
            </linearGradient>
          </defs>
          {branches.map((branch, index) => {
            const lit = hovered === index;
            return (
              <path
                key={index}
                d={branch.d}
                stroke="url(#chain-line)"
                strokeWidth={lit ? 3 : 1.5}
                strokeLinecap="round"
                strokeDasharray={lit ? "6 6" : undefined}
                className={cn("transition-all duration-300", lit && "animate-chain-flow")}
                opacity={hovered === null ? 0.55 : lit ? 1 : 0.2}
                style={lit ? { filter: "drop-shadow(0 0 4px #ff2d95)" } : undefined}
              />
            );
          })}
        </svg>

        {/* Where it started. */}
        <button
          ref={sourceRef}
          type="button"
          onClick={() => onOpen(item.id, false)}
          onMouseEnter={() => setSourceHovered(true)}
          onMouseLeave={() => setSourceHovered(false)}
          className="group relative overflow-hidden rounded-sm bg-secondary shadow-[0_30px_60px_-15px_rgba(0,0,0,0.85)] ring-1 ring-primary/40"
        >
          <span className="relative block aspect-video">
            <img
              src={thumbnailUrl(item)}
              alt=""
              style={framingStyle(item)}
              className="sensitive size-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            {preview && sourceHovered && <PreviewClip itemId={item.id} />}
          </span>
          <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
          <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary-foreground">
            You watched
          </span>
          <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-left">
            <span className="sensitive line-clamp-2 font-bold leading-snug text-white">{item.title}</span>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-black">
              <Play className="ml-0.5 size-4 fill-current" />
            </span>
          </span>
        </button>

        {/* Where it leads: scattered, not stacked. */}
        <ul className="relative flex flex-col gap-3" onMouseLeave={() => setHovered(null)}>
          {related.map((video, index) => {
            const offset = STAGGER[index % STAGGER.length];
            return (
              <li
                key={video.id}
                style={{ "--offset": `${offset}px` } as React.CSSProperties}
                className="md:[margin-left:var(--offset)]"
              >
                <button
                  type="button"
                  onClick={() => onOpen(video.id, false)}
                  onMouseEnter={() => setHovered(index)}
                  onFocus={() => setHovered(index)}
                  className={cn(
                    "group flex w-fit max-w-full items-center gap-4 rounded-lg p-1.5 text-left transition-colors",
                    hovered === index ? "bg-white/[0.06]" : "hover:bg-white/[0.04]",
                  )}
                >
                  <span
                    ref={(node) => {
                      stillRefs.current[index] = node;
                    }}
                    className="relative block aspect-video shrink-0 overflow-hidden rounded-sm bg-secondary"
                    style={{ width: STILL_WIDTH }}
                  >
                    <img
                      src={thumbnailUrl(video)}
                      alt=""
                      loading="lazy"
                      style={framingStyle(video)}
                      className="sensitive size-full object-cover"
                    />
                    {preview && hovered === index && <PreviewClip itemId={video.id} />}
                  </span>
                  <span className="min-w-0 max-w-md space-y-0.5">
                    <span className="sensitive block truncate text-[10px] font-bold uppercase tracking-[0.2em] text-primary/90">
                      {relatedBecause(item, video)}
                    </span>
                    <span
                      className={cn(
                        "sensitive line-clamp-2 text-sm font-bold leading-snug transition-colors md:text-base",
                        hovered === index && "text-primary",
                      )}
                    >
                      {video.title}
                    </span>
                    {video.description && (
                      <span className="sensitive line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {video.description}
                      </span>
                    )}
                    <span className="sensitive block truncate text-xs text-muted-foreground/80">
                      {[
                        video.performers
                          ?.slice(0, 2)
                          .map((performer) => performer.name)
                          .join(", "),
                        formatDuration(video.durationSeconds),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
