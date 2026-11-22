import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft, ChevronRight, Heart, Info, Play, Shuffle } from "lucide-react";
import type { MediaCardItem } from "../MediaCard";
import { PreviewClip } from "../PreviewClip";
import { BecauseYouWatched, MoodPicker } from "./DiscoverScenes";
import { LibraryScene } from "./LibraryScenes";
import { BrandLogo } from "../BrandLogo";
import { useAppearance } from "@/lib/appearance";
import { framingStyle, thumbnailUrl } from "@/lib/mediaItemApi";
import { useProfile } from "@/lib/profile";
import { displayName } from "@/lib/profilesApi";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn, formatDuration } from "@/lib/utils";

type Open = (id: number, autoPlay: boolean) => void;

/**
 * The home page as a sequence of film scenes rather than a page of boxes:
 * no cards, no borders, no rows of tiles. Each part is full-bleed, carried
 * by one large image and big type —
 *
 *   1. the opening shot: tonight's feature, filling the screen, its clip
 *      playing behind the greeting and the title;
 *   2. keep watching: the video you left, over a blurred wash of itself;
 *   3. new from who you follow: a fanned hand of stills beside huge
 *      outlined type;
 *   5. just added, rolled like closing credits over the newest arrival;
 *   6. an end card.
 *
 * Each video appears once. Motion follows the app's rules: clips play only
 * with previews on, discreet mode off, and full motion allowed.
 */
export function EditorialHome({
  featured,
  continueWatching,
  newForYou,
  justAdded,
  recentlyWatched,
  dailyPick,
  tags,
  loading,
  onOpen,
  resumeAction,
}: {
  featured: MediaCardItem[];
  continueWatching: MediaCardItem[];
  newForYou: MediaCardItem[];
  justAdded: MediaCardItem[];
  /** Finished videos, newest first: the first seeds "Because you watched". */
  recentlyWatched: MediaCardItem[];
  dailyPick: MediaCardItem | null;
  tags: { id: number; name: string; itemCount?: number }[];
  loading: boolean;
  onOpen: Open;
  /** Under "Keep watching": the clear-the-list control. */
  resumeAction?: React.ReactNode;
}) {
  const { hoverPreview, discreet, motion } = useAppearance();
  const osReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const previews = hoverPreview && !discreet;

  const used = new Set<number>();
  const take = (items: MediaCardItem[], count: number) => {
    const out: MediaCardItem[] = [];
    for (const item of items) {
      if (out.length >= count) break;
      if (item.itemType !== "video" || used.has(item.id)) continue;
      used.add(item.id);
      out.push(item);
    }
    return out;
  };

  const [lead] = take(featured.length ? featured : dailyPick ? [dailyPick] : justAdded, 1);
  const resume = take(continueWatching, 6);
  const fresh = take(newForYou, 5);
  const credits = take(justAdded, 7);
  // What "Because you watched" builds on: the last video finished, or failing
  // that the one you're in the middle of.
  const lastWatched =
    recentlyWatched.find((item) => item.itemType === "video") ??
    continueWatching.find((item) => item.itemType === "video") ??
    null;

  // Chapter numbers count only the scenes that are actually shown.
  let chapterCount = 0;
  const chapters = { next: () => String(++chapterCount).padStart(2, "0") };

  if (loading && !lead) return <div className="skeleton -mx-4 -mt-[72px] h-[78vh] md:-mx-6 md:-mt-[80px]" />;

  return (
    // Scenes run edge to edge, so the page's own gutters are cancelled here.
    <div className="-mx-4 -mt-[72px] md:-mx-6 md:-mt-[80px]">
      {lead && (
        <OpeningShot
          item={lead}
          preview={previews}
          onOpen={onOpen}
          toFinish={continueWatching.length}
          newCount={newForYou.length}
          parallax={motion === "full" && !osReducedMotion}
        />
      )}
      {/* The library's categories, straight under the hero. The scene bleeds
          past the page's gutters itself, which this page already does, so
          the padding here cancels that out. */}
      <Reveal>
        <div className="px-4 md:px-6">
          <LibraryScene />
        </div>
      </Reveal>
      {resume.length > 0 && (
        <Reveal>
          <KeepWatching
            items={resume}
            onOpen={onOpen}
            action={resumeAction}
            chapter={chapters.next()}
            preview={previews}
          />
        </Reveal>
      )}
      {lastWatched && (
        <Reveal>
          <BecauseYouWatched
            item={lastWatched}
            chapter={chapters.next()}
            onOpen={onOpen}
            preview={previews}
          />
        </Reveal>
      )}
      {fresh.length > 0 && (
        <Reveal>
          <NewArrivals items={fresh} preview={previews} onOpen={onOpen} chapter={chapters.next()} />
        </Reveal>
      )}
      <Reveal>
        <MoodPicker tags={tags} chapter={chapters.next()} onOpen={onOpen} preview={previews} />
      </Reveal>
      {credits.length > 0 && (
        <Reveal>
          <Credits items={credits} onOpen={onOpen} preview={previews} />
        </Reveal>
      )}
    </div>
  );
}

/**
 * A chapter marker: the scene's number in small figures, a hairline, then
 * its name — the way a film's reels or a book's parts are marked.
 */
function Chapter({ n, label, center = false }: { n: string; label: string; center?: boolean }) {
  return (
    <p
      className={cn(
        "flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-primary",
        center && "justify-center",
      )}
    >
      <span className="font-mono tabular-nums text-muted-foreground">{n}</span>
      <span className="h-px w-8 bg-primary/60" />
      {label}
    </p>
  );
}

/**
 * A scene that fades and rises into place the first time it scrolls into
 * view. With less motion asked for it is simply there.
 */
function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const { motion } = useAppearance();
  const osReduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const still = motion !== "full" || osReduced;
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || still) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [still]);
  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-1000 ease-out",
        still || seen ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

function greeting(hour: number): string {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Performers, each a link to their page, joined like a sentence. */
function PerformerLinks({
  performers,
  max = 2,
}: {
  performers: { id: number; name: string }[];
  max?: number;
}) {
  return (
    <>
      {performers.slice(0, max).map((performer, index) => (
        <span key={performer.id}>
          {index > 0 && ", "}
          <Link
            to="/performer/$performerId"
            params={{ performerId: String(performer.id) }}
            className="underline-offset-4 transition-colors hover:text-primary hover:underline"
          >
            {performer.name}
          </Link>
        </span>
      ))}
    </>
  );
}

/** Who (clickable), then studio and year, as one quiet line. */
function Byline({ item, prefix }: { item: MediaCardItem; prefix?: string }) {
  const performers = item.performers ?? [];
  const rest = [item.studio, item.releaseDate?.slice(0, 4)].filter(Boolean).join(" · ");
  if (performers.length === 0 && !rest) return null;
  return (
    <>
      {prefix}
      <PerformerLinks performers={performers} />
      {performers.length > 0 && rest && " · "}
      {rest}
    </>
  );
}

function Backdrop({ item, className }: { item: MediaCardItem; className?: string }) {
  return (
    <img
      src={thumbnailUrl(item)}
      alt=""
      style={framingStyle(item)}
      className={cn("sensitive absolute inset-0 size-full object-cover", className)}
    />
  );
}

/** Scene one: the feature, full screen, with the greeting set over it. */
/** Tonight in a sentence, from what is actually waiting. */
function rundown(toFinish: number, newCount: number): string {
  const parts: string[] = [];
  if (toFinish > 0) parts.push(`${toFinish} ${toFinish === 1 ? "video" : "videos"} to finish`);
  // Lists arrive a page (50) at a time, so a full page means "at least".
  if (newCount > 0) parts.push(`${newCount >= 50 ? "50+" : newCount} new from who you follow`);
  if (parts.length === 0) return "Everything's ready when you are.";
  return `Tonight: ${parts.join(" and ")}.`;
}

function OpeningShot({
  item,
  preview,
  onOpen,
  toFinish,
  newCount,
  parallax,
}: {
  item: MediaCardItem;
  /** Whether previews may play at all (previews on, discreet off). */
  preview: boolean;
  onOpen: Open;
  toFinish: number;
  newCount: number;
  /** Whether the scene may move as the page scrolls. */
  parallax: boolean;
}) {
  const { profile } = useProfile();
  const sectionRef = useRef<HTMLElement>(null);
  const [hovering, setHovering] = useState(false);
  const imageRef = useRef<HTMLDivElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);
  const wordsRef = useRef<HTMLDivElement>(null);

  // Parallax: as the page scrolls, the picture moves at under half the
  // speed of the page and darkens, and the words drift and fade a little —
  // the camera pulling away. Written straight to the elements once a frame,
  // so scrolling never re-renders the page.
  useEffect(() => {
    if (!parallax) return;
    const image = imageRef.current;
    const shade = shadeRef.current;
    const words = wordsRef.current;
    let frame = 0;
    const update = () => {
      frame = 0;
      const height = sectionRef.current?.offsetHeight ?? 1;
      const y = Math.min(Math.max(window.scrollY, 0), height);
      const progress = y / height;
      if (image) image.style.transform = `translate3d(0, ${y * 0.4}px, 0)`;
      if (shade) shade.style.opacity = String(progress * 0.75);
      if (words) {
        words.style.transform = `translate3d(0, ${y * 0.15}px, 0)`;
        words.style.opacity = String(Math.max(0, 1 - progress * 1.4));
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      for (const node of [image, shade, words]) {
        node?.style.removeProperty("transform");
        node?.style.removeProperty("opacity");
      }
    };
  }, [parallax]);

  const now = new Date();
  const date = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return (
    <section
      ref={sectionRef}
      className="relative flex h-[88vh] min-h-[640px] items-end overflow-hidden"
      // The clip plays only while the pointer is over the scene.
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div ref={imageRef} className="absolute inset-0 will-change-transform">
        <Backdrop item={item} className="animate-ken-burns" />
        {preview && hovering && <PreviewClip itemId={item.id} />}
      </div>
      {/* Darkness pooled at the bottom and left, where the words sit, and
          fading into the page below so the scene has no edge. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.55)_100%)]" />
      <div className="film-grain pointer-events-none absolute inset-0" />
      {/* Deepens as you scroll away from the scene. */}
      <div ref={shadeRef} className="pointer-events-none absolute inset-0 bg-background opacity-0" />

      <div ref={wordsRef} className="absolute inset-0 flex items-end will-change-transform">
        {/* The welcome, top left, clear of the header. */}
        <div className="absolute inset-x-0 top-0 px-6 pt-24 md:px-14 md:pt-28">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
            {date} · {greeting(now.getHours())}
          </p>
          <p className="mt-2 text-2xl font-black tracking-tight text-white md:text-4xl">
            Welcome back{profile && <span className="text-white/60">, {displayName(profile)}</span>}.
          </p>
          <p className="mt-1.5 text-sm text-white/70 md:text-base">{rundown(toFinish, newCount)}</p>
        </div>

        <div className="relative w-full max-w-4xl space-y-5 px-6 pb-16 md:px-14 md:pb-24">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Tonight's feature</p>
          <h1 className="sensitive line-clamp-3 text-5xl font-black leading-[0.95] tracking-tighter text-primary drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] md:text-7xl lg:text-8xl">
            {item.title}
          </h1>
          <p className="sensitive text-base text-white/75 empty:hidden md:text-lg">
            <Byline item={item} />
          </p>
          {item.description && (
            <p className="sensitive line-clamp-2 max-w-2xl text-sm leading-relaxed text-white/65 md:text-base">
              {item.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpen(item.id, true)}
              className="flex items-center gap-2.5 rounded-full bg-white px-7 py-3 text-base font-bold text-black transition-transform hover:scale-[1.04]"
            >
              <Play className="size-5 fill-current" />
              Play
            </button>
            <button
              type="button"
              onClick={() => onOpen(item.id, false)}
              className="flex items-center gap-2 rounded-full px-5 py-3 text-base font-semibold text-white/90 transition-colors hover:bg-white/10"
            >
              <Info className="size-5" />
              More about it
            </button>
            {formatDuration(item.durationSeconds) && (
              <span className="text-sm tabular-nums text-white/60">
                {formatDuration(item.durationSeconds)}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Where each little heart drifts from, and how big, slow and late it is. */
const HEARTS = [
  // A few on the left, by the text.
  { left: 8, top: 18, size: 9, duration: 7, delay: 0 },
  { left: 30, top: 88, size: 8, duration: 7.5, delay: 2.2 },
  { left: 44, top: 30, size: 7, duration: 6, delay: 5 },
  // Thicker towards the right edge.
  { left: 62, top: 60, size: 10, duration: 8, delay: 0.8 },
  { left: 68, top: 12, size: 12, duration: 9, delay: 1.5 },
  { left: 72, top: 84, size: 9, duration: 7, delay: 3.6 },
  { left: 76, top: 38, size: 14, duration: 8.5, delay: 0.3 },
  { left: 80, top: 66, size: 8, duration: 6.5, delay: 4.4 },
  { left: 84, top: 22, size: 10, duration: 7.5, delay: 2.6 },
  { left: 86, top: 92, size: 12, duration: 9, delay: 1.1 },
  { left: 88, top: 50, size: 9, duration: 6, delay: 5.2 },
  { left: 91, top: 6, size: 8, duration: 7, delay: 3.1 },
  { left: 93, top: 74, size: 13, duration: 8, delay: 2 },
  { left: 95, top: 34, size: 7, duration: 6.5, delay: 0.6 },
  { left: 97, top: 58, size: 10, duration: 9.5, delay: 4 },
  { left: 99, top: 16, size: 9, duration: 7.5, delay: 5.8 },
];

/** Little glowing hearts drifting up behind the details, and fading. */
function FloatingHearts() {
  return (
    <div aria-hidden className="pointer-events-none absolute -inset-8 -z-10">
      {HEARTS.map((heart, index) => (
        <Heart
          key={index}
          className="animate-heart-float absolute fill-primary text-primary drop-shadow-[0_0_6px_var(--primary)]"
          style={
            {
              left: `${heart.left}%`,
              top: `${heart.top}%`,
              width: heart.size,
              height: heart.size,
              "--heart-duration": `${heart.duration}s`,
              "--heart-delay": `${heart.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Seconds as a clock: 14:32, or 1:02:09 past the hour. */
function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/**
 * Scene two: where you left off, as a cover carousel. The unfinished videos'
 * covers stand in a row in perspective — the one in focus large and square
 * on in the middle, the rest turned away on either side. Its title, time
 * left and progress sit beneath. The arrows, or a click on a side cover,
 * bring another to the middle; a click on the middle one resumes, and
 * hovering it plays its clip.
 */
function KeepWatching({
  items,
  onOpen,
  action,
  chapter,
  preview,
}: {
  items: MediaCardItem[];
  onOpen: Open;
  action?: React.ReactNode;
  chapter: string;
  preview: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const focus = Math.min(index, items.length - 1);
  const current = items[focus];
  if (!current) return null;

  const go = (to: number) => {
    setIndex(Math.max(0, Math.min(items.length - 1, to)));
    setHovered(false);
  };
  const duration = current.durationSeconds ?? 0;
  const position = current.lastPositionSeconds ?? 0;
  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const left = duration > position ? Math.ceil((duration - position) / 60) : null;

  return (
    <section className="relative overflow-hidden px-6 py-14 md:px-14 md:py-20">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Chapter n={chapter} label="Keep watching" />
          <h2 className="text-3xl font-black tracking-tight md:text-4xl">
            Your unfinished <span className="text-primary">fantasies</span> await.
          </h2>
        </div>
        {action}
      </div>

      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-20">
        <div className="relative flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => go(focus - 1)}
            disabled={focus === 0}
            aria-label="Previous"
            className="z-20 hidden size-11 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-20 md:flex"
          >
            <ChevronLeft className="size-6" />
          </button>

          {/* The covers, in perspective. */}
          <div className="relative aspect-video w-full max-w-xl [perspective:1600px]">
            {items.map((item, i) => {
              const offset = i - focus;
              const distance = Math.abs(offset);
              const centre = offset === 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  tabIndex={distance <= 1 ? 0 : -1}
                  aria-label={centre ? `Resume ${item.title}` : `Show ${item.title}`}
                  onClick={() => (centre ? onOpen(item.id, true) : go(i))}
                  onMouseEnter={centre ? () => setHovered(true) : undefined}
                  onMouseLeave={centre ? () => setHovered(false) : undefined}
                  className="group absolute inset-0 overflow-hidden rounded-md bg-secondary shadow-[0_40px_80px_-30px_rgba(0,0,0,0.95)] ring-1 ring-white/10 transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
                  style={{
                    zIndex: 10 - distance,
                    opacity: distance > 2 ? 0 : 1,
                    pointerEvents: distance > 2 ? "none" : undefined,
                    transform: centre
                      ? "none"
                      : `translateX(${offset * 40}%) translateZ(${-distance * 180}px) rotateY(${offset > 0 ? -40 : 40}deg)`,
                  }}
                >
                  <img
                    src={thumbnailUrl(item)}
                    alt=""
                    loading="lazy"
                    style={framingStyle(item)}
                    className="sensitive size-full object-cover"
                  />
                  {centre && preview && hovered && <PreviewClip itemId={item.id} />}
                  <span
                    className={cn(
                      "absolute inset-0 transition-colors duration-700",
                      centre ? "bg-transparent" : "bg-black/55",
                    )}
                  />
                  {centre && (
                    <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      <span className="flex size-14 items-center justify-center rounded-full bg-white/95 text-black shadow-lg">
                        <Play className="ml-0.5 size-5 fill-current" />
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => go(focus + 1)}
            disabled={focus === items.length - 1}
            aria-label="Next"
            className="z-20 hidden size-11 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-20 md:flex"
          >
            <ChevronRight className="size-6" />
          </button>
        </div>

        {/* The one in focus, in full. */}
        <div className="relative isolate z-20">
          <FloatingHearts />
          <div key={current.id} className="relative animate-fade-in space-y-5">
            <p className="sensitive text-3xl font-black leading-tight tracking-tight md:text-4xl">
              {current.title}
            </p>
            <p className="sensitive text-sm text-white/80">
              <Byline item={current} />
            </p>
            {current.description && (
              <p className="sensitive line-clamp-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
                {current.description}
              </p>
            )}
            <div className="max-w-sm space-y-2">
              <div className="flex justify-between font-mono text-xs tabular-nums text-muted-foreground">
                <span>
                  {formatClock(position)} / {formatClock(duration)}
                </span>
                <span className="text-primary">{left !== null ? `${left} min left` : "Pick up again"}</span>
              </div>
              <span className="block h-1 overflow-hidden rounded-full bg-white/10">
                <span
                  className="block h-full rounded-full bg-primary shadow-[0_0_8px_var(--primary)]"
                  style={{ width: `${progress}%` }}
                />
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpen(current.id, true)}
              className="flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition-transform hover:scale-105"
            >
              <Play className="size-4 fill-current" />
              Resume
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Where each still in the fanned hand sits, from the back to the front. */
const FAN = [
  "left-[2%] top-[18%] w-[46%] -rotate-[7deg]",
  "left-[16%] top-[4%] w-[48%] -rotate-[2deg]",
  "left-[34%] top-[14%] w-[50%] rotate-[3deg]",
  "left-[50%] top-[2%] w-[46%] rotate-[8deg]",
  "left-[24%] top-[34%] w-[52%] rotate-0",
];

/** Scene three: what's new, as a hand of stills fanned out beside huge outlined type. */
function NewArrivals({
  items,
  preview,
  onOpen,
  chapter,
}: {
  items: MediaCardItem[];
  preview: boolean;
  onOpen: Open;
  chapter: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <section className="relative overflow-hidden pt-16 pb-6 md:pt-24 md:pb-8">
      {/* The word itself, enormous and hollow, behind everything. */}
      <p
        aria-hidden
        className="pointer-events-none absolute -left-4 top-6 select-none text-[22vw] font-black uppercase leading-none tracking-tighter opacity-20 md:text-[16vw]"
        style={{ WebkitTextStroke: "2px var(--foreground)", color: "transparent" }}
      >
        New
      </p>

      <div className="relative grid items-center gap-12 px-6 md:grid-cols-[2fr_3fr] md:px-14">
        <div className="space-y-4">
          <Chapter n={chapter} label="Just in" />
          <h2 className="text-4xl font-black leading-[0.95] tracking-tighter md:text-6xl">
            New from <span className="text-primary">who you follow</span>
          </h2>
          <p className="max-w-sm text-muted-foreground">
            {hovered !== null ? (
              <span className="sensitive font-semibold text-foreground">{items[hovered].title}</span>
            ) : (
              "Hover a still to see what it is. Click to open it."
            )}
          </p>
          <Link
            to="/feed"
            className="flex w-fit items-center gap-2 border-b border-foreground pb-0.5 text-sm font-bold transition-colors hover:border-primary hover:text-primary"
          >
            Open the feed
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="relative aspect-[2/1]">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item.id, false)}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                "absolute aspect-video overflow-hidden rounded-sm shadow-[0_30px_60px_-15px_rgba(0,0,0,0.85)] transition-all duration-500 ease-out",
                FAN[index % FAN.length],
                hovered === index ? "z-20 !rotate-0 scale-110" : "z-0",
                hovered !== null && hovered !== index && "opacity-50",
              )}
              style={{ zIndex: hovered === index ? 20 : index }}
            >
              <Backdrop item={item} />
              {preview && hovered === index && <PreviewClip itemId={item.id} />}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Scene five: just added, rolled like closing credits; a hovered title's clip plays behind. */
function Credits({ items, onOpen, preview }: { items: MediaCardItem[]; onOpen: Open; preview: boolean }) {
  // The title under the pointer: its clip plays behind the credits.
  const [hovered, setHovered] = useState<MediaCardItem | null>(null);
  return (
    <section className="relative overflow-hidden pt-14 pb-20 md:pt-16 md:pb-28">
      {/* Where this scene begins: a hairline of the accent, fading out at both ends. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 z-10 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-primary/60 to-transparent"
      />
      {/* Keyed by the hovered video, so moving between titles fades one
          clip out and the next one in rather than swapping in place. */}
      {hovered && (
        <div key={hovered.id} className="animate-fade-in pointer-events-none absolute inset-0 opacity-50">
          <Backdrop item={hovered} />
          {preview && <PreviewClip itemId={hovered.id} />}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background via-background/60 to-background" />
      {/* The word itself, enormous and hollow, barely there behind the list. */}
      <p
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none whitespace-nowrap text-[15vw] font-black uppercase leading-none tracking-tighter transition-opacity duration-500 md:text-[12vw]",
          // Out of the way while a hovered title plays behind the credits.
          hovered ? "opacity-0" : "opacity-[0.18]",
        )}
        style={{ WebkitTextStroke: "2px var(--primary)", color: "transparent" }}
      >
        Just added
      </p>

      <div className="relative mx-auto max-w-2xl px-6 text-center">
        <CreditList items={items} onOpen={onOpen} onHover={setHovered} />
      </div>
    </section>
  );
}

/** The credits themselves. */
function CreditList({
  items,
  onOpen,
  onHover,
}: {
  items: MediaCardItem[];
  onOpen: Open;
  onHover: React.Dispatch<React.SetStateAction<MediaCardItem | null>>;
}) {
  return (
    <ol>
      {items.map((item, index) => (
        <li
          key={item.id}
          className="pb-7"
          onMouseEnter={() => onHover(item)}
          onMouseLeave={() => onHover((current) => (current?.id === item.id ? null : current))}
        >
          {/* A small ornament between entries, as on a credits roll. */}
          {index > 0 && (
            <span aria-hidden className="mb-7 block text-xs text-primary/60">
              ✦
            </span>
          )}
          <button type="button" onClick={() => onOpen(item.id, false)} className="group w-full">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.3em] text-primary/90">
              {item.studio ?? item.releaseDate?.slice(0, 4) ?? "\u00a0"}
            </span>
            <span className="sensitive mt-1 block text-2xl font-bold tracking-tight transition-colors group-hover:text-primary md:text-3xl">
              {item.title}
            </span>
          </button>
          {item.performers && item.performers.length > 0 && (
            <p className="sensitive mt-1 text-sm italic text-foreground/85">
              <span className="text-muted-foreground">starring</span>{" "}
              <PerformerLinks performers={item.performers} max={3} />
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * Behind the closing card: the library's own stills, tilted, blurred and
 * dimmed into a wall, fading out to the edges and darkest behind the words —
 * texture, not content.
 */
function StillWall({ items }: { items: MediaCardItem[] }) {
  const seen = new Set<number>();
  const stills = items.filter((item) => {
    if (item.itemType !== "video" || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  if (stills.length < 4) return null;
  // Enough to fill the wall, repeating the few there are if need be.
  const wall = Array.from({ length: 18 }, (_, i) => stills[i % stills.length]);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_70%_80%_at_50%_50%,black_20%,transparent_75%)]"
    >
      <div className="absolute -inset-x-[10%] -inset-y-1/2 grid -rotate-6 grid-cols-6 gap-3 opacity-30 blur-[2px]">
        {wall.map((item, index) => (
          <div key={index} className="relative aspect-video overflow-hidden rounded-sm">
            <Backdrop item={item} />
          </div>
        ))}
      </div>
      {/* Darkest in the middle, where the words sit. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_35%_45%_at_50%_50%,var(--background)_0%,transparent_100%)] opacity-90" />
    </div>
  );
}

/**
 * Scene six: the closing card. Where the page ends, it says so and offers
 * the next step — a random video, the whole library, the feed, or back up to
 * the feature — instead of ending on a logo with nothing to do.
 */
export function EndCard({ onOpen, stills }: { onOpen: Open; stills: MediaCardItem[] }) {
  const [rolling, setRolling] = useState(false);

  async function surprise() {
    setRolling(true);
    try {
      const seed = Math.floor(Math.random() * 1_000_000);
      const res = await fetch(`/api/media-items?type=video&sort=random&seed=${seed}`);
      if (!res.ok) return;
      const { items } = (await res.json()) as { items: MediaCardItem[] };
      const pick = items.find((item) => item.itemType === "video");
      if (pick) onOpen(pick.id, true);
    } finally {
      setRolling(false);
    }
  }

  return (
    <section className="relative flex flex-col items-center gap-5 overflow-hidden px-6 py-28 text-center">
      <StillWall items={stills} />
      {/* A soft pool of the accent colour behind the words. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 40% 60% at 50% 50%, color-mix(in oklch, var(--primary) 16%, transparent), transparent 70%)",
        }}
      />
      {/* The logo, a dot, then a word that changes in place. */}
      <div className="relative mb-4 flex flex-wrap items-baseline justify-center gap-x-5 gap-y-2">
        <BrandLogo size="hero" tagline={false} />
        <span aria-hidden className="text-5xl font-black text-primary md:text-7xl lg:text-8xl">
          ·
        </span>
        <RotatingWord words={["Untamed", "Unfiltered", "Unforgettable"]} />
      </div>
      <div className="relative space-y-2">
        <p className="text-3xl font-black tracking-tight md:text-5xl">
          In the mood for something <span className="text-primary">naughty</span>?
        </p>
        <p className="mx-auto max-w-none text-balance text-muted-foreground md:text-lg">
          Discover videos that match your desires, explore new fantasies, and find exactly what gets your
          attention.
        </p>
        <p className="pt-2 text-xs font-semibold uppercase tracking-[0.35em] text-primary md:text-sm">
          Your fantasies. Your freedom. Your pleasure.
        </p>
      </div>
      <div className="relative flex flex-wrap items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => void surprise()}
          disabled={rolling}
          className="flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition-transform hover:scale-[1.04] disabled:opacity-70"
        >
          <Shuffle className={cn("size-4", rolling && "animate-spin")} />
          Tempt me
        </button>
        <Link
          to="/browse"
          className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-foreground/90 ring-1 ring-border transition-colors hover:bg-white/10"
        >
          Browse the library
          <ArrowRight className="size-4" />
        </Link>
        <Link
          to="/feed"
          className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-foreground/90 ring-1 ring-border transition-colors hover:bg-white/10"
        >
          Open the feed
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}

/** How long each word holds before the next slides in. */
const WORD_MS = 3000;

/**
 * One word that changes in place, each new one sliding up into view. The
 * space is held at the longest word's width, so nothing beside it shifts.
 * With less motion asked for, the words sit together, dotted apart.
 */
function RotatingWord({ words }: { words: string[] }) {
  const { motion } = useAppearance();
  const osReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const animated = motion === "full" && !osReducedMotion;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!animated) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % words.length), WORD_MS);
    return () => window.clearInterval(timer);
  }, [animated, words.length]);

  const wordClass = "text-5xl font-black leading-[1.1] tracking-tighter text-white md:text-7xl lg:text-8xl";

  if (!animated) {
    return <p className={wordClass}>{words.join(" · ")}</p>;
  }

  const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
  return (
    <span className="grid overflow-hidden">
      {/* Holds the width and height of the longest word. */}
      <span className={cn(wordClass, "invisible col-start-1 row-start-1")}>{longest}</span>
      <span key={index} className={cn(wordClass, "animate-word-in col-start-1 row-start-1 text-left")}>
        {words[index]}
      </span>
    </span>
  );
}
