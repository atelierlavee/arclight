// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

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
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  fetchFollowingTags,
  fetchSuggestions,
  fetchUpcoming,
  suggestionReasons,
  type Upcoming,
} from "@/lib/followingApi";
import { performerPortraitUrl } from "@/lib/performerApi";
import { qk } from "@/lib/queryKeys";
import { useFollowToggle } from "@/lib/useFollowToggle";
import { PerformerAvatar } from "./PerformerAvatar";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { useIsOwner } from "@/lib/profile";
import { cn } from "@/lib/utils";

/**
 * The feed's right-hand column, kept to what only the feed has: what is
 * who to follow next, what is waiting in the inbox from who you follow, and
 * the tags trending among them. Continue watching is Home's and the numbers are
 * Your stats'. Wide screens only; the feed itself is the page.
 */
export function FeedSidebar() {
  const { data: trending } = useQuery({
    queryKey: qk.following.tags,
    queryFn: fetchFollowingTags,
  });

  return (
    <div className="space-y-4">
      <Suggested />
      <ComingUp />
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
        <Link to="/feed" search={{ manage: true }} className="text-xs text-muted-foreground hover:text-foreground">
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
