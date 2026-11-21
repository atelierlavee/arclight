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

/** How many moods to offer, and how many videos each fills in. */
const MOODS = 8;
const MOOD_PICKS = 4;

/**
 * "What's the mood tonight?" as a full-bleed scene. Your biggest tags stack
 * down the left in big type; picking one deals four of its videos, shuffled.
 * The video in focus fills the whole section behind everything (its clip
 * plays while you hover it), with its title and a Play button on the right
 * above a slim strip of the four. Shuffle deals four more.
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
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
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

  if (moods.length < 3) return null;

  const picks = data ?? [];
  const focused = picks.find((item) => item.id === focusedId) ?? picks[0];

  return (
    <section className="relative isolate overflow-hidden" onMouseLeave={() => setPlaying(false)}>
      {/* The video in focus, filling the scene. All four are stacked and
          cross-fade, so switching never flashes black. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-black">
        {picks.map((item) => (
          <img
            key={item.id}
            src={thumbnailUrl(item)}
            alt=""
            style={framingStyle(item)}
            className={cn(
              "sensitive absolute inset-0 size-full object-cover transition-opacity duration-700",
              item.id === focused?.id ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
        {preview && playing && focused && <PreviewClip key={focused.id} itemId={focused.id} />}
        <div className="absolute inset-0 bg-black/55" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/75 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background to-transparent" />
      </div>

      <div className="grid min-h-[36rem] gap-10 px-6 py-16 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:px-14 md:py-20">
        {/* The moods: a stacked list of words, the chosen one lit. */}
        <div className="flex flex-col justify-center">
          <Kicker n={chapter} label="Pick a mood" />
          <h2 className="mt-3 mb-6 text-lg font-semibold text-muted-foreground">
            What’s the <span className="text-primary">mood</span> tonight?
          </h2>
          <ul className="space-y-1">
            {moods.map((tag) => {
              const active = tag.id === mood.id;
              return (
                <li key={tag.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setPickedId(tag.id);
                      setFocusedId(null);
                    }}
                    className={cn(
                      "sensitive group flex items-baseline gap-3 text-left text-3xl font-black capitalize leading-tight tracking-tight transition-all duration-300 md:text-5xl",
                      active
                        ? "translate-x-3 text-white"
                        : "text-white/25 hover:translate-x-1 hover:text-white/60",
                    )}
                  >
                    <span
                      className={cn(
                        "h-[0.12em] self-center bg-primary transition-all duration-300",
                        active ? "w-8 md:w-12" : "w-0",
                      )}
                    />
                    {tag.name}
                    <sup
                      className={cn(
                        "font-mono text-xs font-medium tabular-nums transition-opacity",
                        active ? "text-primary opacity-100" : "opacity-0 group-hover:opacity-60",
                      )}
                    >
                      {tag.itemCount}
                    </sup>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* The video in focus: its title and Play, over the strip of four. */}
        <div className={cn("flex flex-col justify-end gap-6 transition-opacity", isFetching && "opacity-60")}>
          {focused && (
            <div key={focused.id} className="max-w-lg space-y-3 motion-safe:animate-word-in">
              <h3 className="sensitive line-clamp-2 text-2xl font-black leading-tight tracking-tight md:text-4xl">
                {focused.title}
              </h3>
              <p className="sensitive text-sm text-white/70">
                {[
                  (focused.performers ?? [])
                    .slice(0, 3)
                    .map((performer) => performer.name)
                    .join(", "),
                  formatDuration(focused.durationSeconds),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="flex items-center gap-4 pt-1">
                <button
                  type="button"
                  onClick={() => onOpen(focused.id, true)}
                  className="flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-bold text-black transition-transform hover:scale-105"
                >
                  <Play className="size-4 fill-current" />
                  Play
                </button>
                <button
                  type="button"
                  onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}
                  className="flex items-center gap-1.5 text-sm font-medium text-white/70 transition-colors hover:text-white"
                >
                  <Shuffle className={cn("size-4", isFetching && "animate-spin")} />
                  Deal four more
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 gap-3">
            {picks.map((item) => {
              const active = item.id === focused?.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={item.title}
                  onMouseEnter={() => {
                    setFocusedId(item.id);
                    setPlaying(true);
                  }}
                  onFocus={() => setFocusedId(item.id)}
                  onClick={() => onOpen(item.id, false)}
                  className={cn(
                    "relative aspect-video overflow-hidden rounded-sm transition-all duration-300",
                    active ? "opacity-100 ring-2 ring-primary" : "opacity-50 hover:opacity-90",
                  )}
                >
                  <img
                    src={thumbnailUrl(item)}
                    alt=""
                    loading="lazy"
                    style={framingStyle(item)}
                    className="sensitive size-full object-cover"
                  />
                </button>
              );
            })}
          </div>
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
                className={cn("transition-all duration-300", lit && "motion-safe:animate-chain-flow")}
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
