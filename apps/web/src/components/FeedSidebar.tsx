import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Hash,
  Inbox,
  Loader2,
  PlayCircle,
  Sparkles,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { PerformerAvatar } from "./PerformerAvatar";
import {
  arrivedAgo,
  fetchFollowingStats,
  fetchFollowingTags,
  fetchSuggestions,
  fetchUpcoming,
  sharePercent,
  suggestionReasons,
  type FollowingStats,
  type Upcoming,
} from "@/lib/followingApi";
import { formatWatchTime } from "@/lib/insights";
import { performerPortraitUrl } from "@/lib/performerApi";
import { qk } from "@/lib/queryKeys";
import { playItem } from "@/lib/appEvents";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { useIsOwner } from "@/lib/profile";
import { useFollowToggle } from "@/lib/useFollowToggle";
import { cn } from "@/lib/utils";
import type { MediaCardItem } from "./MediaCard";

/**
 * The feed's right-hand column: what you were in the middle of, who to
 * follow next, what is waiting in the inbox, how your following looks at a
 * glance, and the tags trending among who you follow. Wide screens only; the
 * feed itself is the page.
 */
export function FeedSidebar() {
  const { data: stats } = useQuery({
    queryKey: qk.following.stats,
    queryFn: fetchFollowingStats,
  });
  const { data: trending } = useQuery({
    queryKey: qk.following.tags,
    queryFn: fetchFollowingTags,
  });

  return (
    <div className="space-y-4">
      <ContinueWatching />
      <Suggested />
      <ComingUp />
      {stats ? <AtAGlance stats={stats} /> : <CardSkeleton />}
      {trending ? (
        trending.tags.length > 0 && (
          <Card title={trending.recent ? "Trending" : "Popular with who you follow"} icon={Hash}>
            {trending.recent && (
              <p className="-mt-1 mb-2 text-xs text-muted-foreground">
                Across what arrived in the last {trending.days} days
              </p>
            )}
            <ul className="flex flex-wrap gap-1">
              {trending.tags.map((tag) => (
                <li key={tag.id}>
                  <Link
                    to="/browse"
                    search={{ tag: tag.name, following: "true" }}
                    title={`${tag.count} video${tag.count === 1 ? "" : "s"}`}
                    className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs transition-colors hover:bg-accent"
                  >
                    <span className="sensitive font-medium">#{tag.name.replace(/\s+/g, "")}</span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">{tag.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )
      ) : (
        <CardSkeleton />
      )}
    </div>
  );
}

function AtAGlance({ stats }: { stats: FollowingStats }) {
  const followed = stats.following.performers + stats.following.studios;
  const share = sharePercent(stats.share.recentFollowed, stats.share.recentTotal);
  const top = [
    ...stats.top.performers.map((row) => ({
      ...row,
      kind: "performer" as const,
    })),
    ...stats.top.studios.map((row) => ({ ...row, kind: "studio" as const })),
  ]
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 3);
  const quiet = [
    ...stats.quiet.performers.map((row) => ({
      ...row,
      kind: "performer" as const,
    })),
    ...stats.quiet.studios.map((row) => ({ ...row, kind: "studio" as const })),
  ].slice(0, 3);

  return (
    <Card
      title="Your following"
      icon={UserCheck}
      action={
        <Link to="/stats" className="text-xs text-muted-foreground hover:text-foreground">
          See stats
        </Link>
      }
    >
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-secondary/60 px-3 py-2.5">
          <dt className="text-xs text-muted-foreground">Following</dt>
          <dd className="text-2xl font-semibold tabular-nums">{followed}</dd>
        </div>
        <div className="rounded-lg bg-secondary/60 px-3 py-2.5">
          <dt className="text-xs text-muted-foreground">Of your watching</dt>
          <dd className="text-2xl font-semibold tabular-nums">{share === null ? "—" : `${share}%`}</dd>
        </div>
      </dl>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Share of watch time, last {stats.recentDays} days
      </p>

      {top.length > 0 && (
        <Section title="Most watched this month">
          {top.map((row) => (
            <PersonRow key={`${row.kind}:${row.id}`} row={row} detail={formatWatchTime(row.seconds)} />
          ))}
        </Section>
      )}

      {quiet.length > 0 && (
        <Section title="Gone quiet">
          {quiet.map((row) => (
            <PersonRow
              key={`${row.kind}:${row.id}`}
              row={row}
              detail={row.lastWatchedAt ? `watched ${arrivedAgo(row.lastWatchedAt)}` : "never watched"}
            />
          ))}
        </Section>
      )}
    </Card>
  );
}

type Row = {
  id: number;
  name: string;
  kind: "performer" | "studio";
  hasImage?: boolean;
  hasBanner?: boolean;
};

function PersonRow({ row, detail }: { row: Row; detail: string }) {
  const avatar =
    row.kind === "performer" ? (
      <PerformerAvatar
        name={row.name}
        src={performerPortraitUrl({
          id: row.id,
          hasImage: Boolean(row.hasImage),
          hasBanner: Boolean(row.hasBanner),
          representativeItemId: null,
        })}
        className="sensitive size-8 shrink-0 rounded-full"
      />
    ) : (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
        <Building2 className="size-3.5 text-muted-foreground" />
      </span>
    );
  const body = (
    <>
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="sensitive block truncate text-sm font-medium">{row.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
    </>
  );
  const className = "flex items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent";
  return (
    <li>
      {row.kind === "performer" ? (
        <Link to="/performer/$performerId" params={{ performerId: String(row.id) }} className={className}>
          {body}
        </Link>
      ) : (
        <Link to="/studio/$studioId" params={{ studioId: String(row.id) }} className={className}>
          {body}
        </Link>
      )}
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="-mx-1.5">{children}</ul>
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[15px] font-bold">
          <Icon className="size-4 text-primary" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="skeleton h-4 w-32 rounded" />
      <div className="skeleton h-16 w-full rounded-lg" />
      <div className="skeleton h-3 w-2/3 rounded" />
    </div>
  );
}

/** How many suggestions the card lists; the rest are on the Following page. */
const SUGGESTED_SHOWN = 5;

type Suggestion = {
  kind: "performer" | "studio";
  id: number;
  name: string;
  hasImage?: boolean;
  hasBanner?: boolean;
  representativeItemId: number | null;
  reason: string;
};

/**
 * Who to follow next, as a short list — scored from this profile's own
 * watching, each with its strongest reason. A row leaves once followed.
 */
function Suggested() {
  const { setFollowed, pending } = useFollowToggle();
  const { data } = useQuery({ queryKey: qk.following.suggestions, queryFn: fetchSuggestions });

  if (!data) return <CardSkeleton />;
  const suggestions: Suggestion[] = [
    ...data.performers.map((p) => ({
      kind: "performer" as const,
      id: p.id,
      name: p.name,
      hasImage: p.hasImage,
      hasBanner: p.hasBanner,
      representativeItemId: p.representativeItemId,
      reason: suggestionReasons(p, p.isFavorite)[0] ?? "",
    })),
    ...data.studios.map((s) => ({
      kind: "studio" as const,
      id: s.id,
      name: s.name,
      representativeItemId: s.representativeItemId,
      reason: suggestionReasons(s)[0] ?? "",
    })),
  ];
  if (suggestions.length === 0) return null;

  return (
    <Card
      title="Suggested for you"
      icon={Sparkles}
      action={
        <Link to="/following" className="text-xs text-muted-foreground hover:text-foreground">
          See all
        </Link>
      }
    >
      <ul className="-mx-1.5">
        {suggestions.slice(0, SUGGESTED_SHOWN).map((suggestion) => {
          const key = `${suggestion.kind}:${suggestion.id}`;
          const to =
            suggestion.kind === "performer"
              ? ({ to: "/performer/$performerId", params: { performerId: String(suggestion.id) } } as const)
              : ({ to: "/studio/$studioId", params: { studioId: String(suggestion.id) } } as const);
          return (
            <li
              key={key}
              className="flex items-center gap-2.5 rounded-md px-1.5 py-2 transition-colors hover:bg-accent/60"
            >
              <Link {...to} className="flex min-w-0 flex-1 items-center gap-2.5">
                {suggestion.kind === "performer" ? (
                  <PerformerAvatar
                    name={suggestion.name}
                    src={performerPortraitUrl({
                      id: suggestion.id,
                      hasImage: Boolean(suggestion.hasImage),
                      hasBanner: Boolean(suggestion.hasBanner),
                      representativeItemId: suggestion.representativeItemId,
                    })}
                    className="sensitive size-10 shrink-0 rounded-full"
                  />
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <Building2 className="size-4 text-muted-foreground" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="sensitive block truncate text-sm font-semibold hover:underline">
                    {suggestion.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {suggestion.reason || (suggestion.kind === "studio" ? "Studio" : "Performer")}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => void setFollowed(suggestion, true)}
                className="flex h-8 w-[72px] shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {pending === key ? <Loader2 className="size-3.5 animate-spin" /> : "Follow"}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** How many part-watched videos "Continue watching" lists. */
const CONTINUE_SHOWN = 3;

/**
 * Videos from who you follow that you started and didn't finish, most
 * recently watched first, each resuming where you left off.
 */
function ContinueWatching() {
  const { data } = useQuery({
    queryKey: qk.mediaItems.followingContinue,
    queryFn: async () => {
      const res = await fetch("/api/media-items?following=true&progress=in-progress&sort=watched");
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      return ((await res.json()) as { items: MediaCardItem[] }).items.slice(0, CONTINUE_SHOWN);
    },
  });
  if (!data || data.length === 0) return null;
  return (
    <Card title="Continue watching" icon={PlayCircle}>
      <ul className="-mx-1.5 space-y-1">
        {data.map((item) => {
          const progress =
            item.durationSeconds && item.lastPositionSeconds
              ? Math.min(1, item.lastPositionSeconds / item.durationSeconds)
              : 0;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => playItem(item.id, { resume: true })}
                className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-accent"
              >
                <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded bg-black">
                  <img
                    src={thumbnailUrl(item)}
                    alt=""
                    loading="lazy"
                    className="sensitive size-full object-cover"
                  />
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/25">
                    <span className="block h-full bg-red-500" style={{ width: `${progress * 100}%` }} />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="sensitive line-clamp-2 text-sm font-medium leading-snug">
                    {item.title}
                  </span>
                  {item.performers && item.performers.length > 0 && (
                    <span className="sensitive block truncate text-xs text-muted-foreground">
                      {item.performers.map((p) => p.name).join(", ")}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * What the feed will have once it is approved: the newest videos from who
 * you follow still waiting in the inbox. The owner's, since only they
 * approve.
 */
function ComingUp() {
  const isOwner = useIsOwner();
  const { data } = useQuery({ queryKey: qk.following.upcoming, queryFn: fetchUpcoming, enabled: isOwner });
  if (!isOwner || !data || data.count === 0) return null;
  return (
    <Card
      title="Coming up"
      icon={Inbox}
      action={
        <Link to="/inbox" className="text-xs text-muted-foreground hover:text-foreground">
          Review {data.count}
        </Link>
      }
    >
      <p className="-mt-1 mb-2 text-xs text-muted-foreground">
        {data.count} video{data.count === 1 ? "" : "s"} from who you follow waiting in your inbox
      </p>
      <UpcomingSlider items={data.items} />
    </Card>
  );
}

/**
 * The waiting videos as a slider: one large at a time with the next peeking
 * in, scrolled by swipe, trackpad or the arrows that show on hover.
 */
function UpcomingSlider({ items }: { items: Upcoming["items"] }) {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: items.length <= 1 });

  const measure = useCallback(() => {
    const node = track.current;
    if (!node) return;
    setEdges({
      start: node.scrollLeft <= 4,
      end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 4,
    });
  }, []);
  useEffect(() => {
    measure();
  }, [items, measure]);

  function slide(direction: 1 | -1) {
    const node = track.current;
    const first = node?.firstElementChild as HTMLElement | null;
    if (!node || !first) return;
    // One slide and its gap at a time.
    node.scrollBy({ left: direction * (first.offsetWidth + 8), behavior: "smooth" });
  }

  return (
    <div className="group/slider relative">
      <ul
        ref={track}
        onScroll={measure}
        className="scrollbar-hide -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth px-4"
      >
        {items.map((item) => (
          <li key={item.id} className="w-[85%] shrink-0 snap-start">
            <Link to="/inbox" search={{ item: item.id }} className="group block" title={item.title}>
              <span className="relative block aspect-video overflow-hidden rounded-lg bg-black">
                <img
                  src={thumbnailUrl(item)}
                  alt=""
                  loading="lazy"
                  className="sensitive size-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-2 pt-6">
                  <span className="sensitive line-clamp-2 text-xs font-medium leading-snug text-white">
                    {item.title}
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {!edges.start && <SlideArrow side="left" onClick={() => slide(-1)} />}
      {!edges.end && <SlideArrow side="right" onClick={() => slide(1)} />}
    </div>
  );
}

function SlideArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous" : "Next"}
      className={cn(
        "absolute top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow-md transition-opacity focus-visible:opacity-100 group-hover/slider:opacity-100",
        side === "left" ? "left-1" : "right-1",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
