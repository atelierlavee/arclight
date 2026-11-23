// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Building2, CheckCircle2, Clock, Heart, MoreHorizontal, Play } from "lucide-react";
import { PerformerAvatar } from "../PerformerAvatar";
import { PreviewClip } from "../PreviewClip";
import { useCardShortcuts } from "@/lib/cardShortcuts";
import { joinNames } from "@/lib/feed";
import type { FeedItem } from "@/lib/followingApi";
import { setItemNote, setWatchLater, thumbnailUrl } from "@/lib/mediaItemApi";
import { performerPortraitUrl } from "@/lib/performerApi";
import { qk } from "@/lib/queryKeys";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** What the feed can ask of a post from the keyboard. */
export type PostHandle = { like: () => void; play: () => void; node: HTMLElement | null };

/** A double-click is two clicks this close together; a single click waits this long to be sure. */
const DOUBLE_CLICK_MS = 250;

/**
 * Local overrides for the post's own state, so a press shows at once.
 *
 * Each remembers the server value it was made against: once a refetch brings
 * a different one, the server's answer wins again, with no effect needed to
 * reset it.
 */
function useOptimistic<T>(server: T): [T, (now: T) => void] {
  const [override, setOverride] = useState<{ was: T; now: T } | null>(null);
  const value = override && Object.is(override.was, server) ? override.now : server;
  return [value, (now: T) => setOverride({ was: server, now })];
}

/** One video as a post: who and when, the video, the actions, then the caption. */
export function FeedPost({
  item,
  isNew,
  selected,
  playing,
  hoverPreview,
  onVisibility,
  onOpen,
  onMenu,
  register,
}: {
  item: FeedItem;
  /** Arrived since the last visit. */
  isNew: boolean;
  /** Picked out with J and K. */
  selected: boolean;
  /** This is the post in view, and autoplay is on. */
  playing: boolean;
  /** Autoplay is off but previews are allowed: play while the pointer is over it. */
  hoverPreview: boolean;
  onVisibility: (id: number, ratio: number) => void;
  onOpen: (autoPlay: boolean) => void;
  onMenu: (event: React.MouseEvent, item: FeedItem) => void;
  register: (id: number, handle: PostHandle | null) => void;
}) {
  const { performers, studio } = item.because;
  const { toggleFavourite, toggleWatched } = useCardShortcuts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [hovering, setHovering] = useState(false);
  const [burst, setBurst] = useState(0);

  const [favourite, setFavourite] = useOptimistic(Boolean(item.isFavorite));
  const [later, setLater] = useOptimistic(item.watchLaterAt != null);
  const [seen, setSeen] = useOptimistic(Boolean(item.watched));

  // How much of the video is on screen, for the feed to pick the one to play.
  const article = useRef<HTMLElement>(null);
  const media = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const node = media.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => onVisibility(item.id, entry.isIntersecting ? entry.intersectionRatio : 0),
      { threshold: [0, 0.25, 0.5, 0.6, 0.75, 0.9, 1] },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      onVisibility(item.id, 0);
    };
  }, [item.id, onVisibility]);
  const showPreview = playing || (hoverPreview && hovering);

  function toggleLike() {
    setFavourite(!favourite);
    toggleFavourite(item);
  }

  /** Double-click, or L: only ever favourites — a second one never takes it back. */
  function like() {
    setBurst((n) => n + 1);
    if (!favourite) toggleLike();
  }

  // The feed's keys reach the post through this.
  const handle = useRef<PostHandle>({ like: () => {}, play: () => {}, node: null });
  // Kept current after every render, so a key acts on this render's state.
  useEffect(() => {
    handle.current.like = like;
    handle.current.play = () => onOpen(true);
  });
  useEffect(() => {
    handle.current.node = article.current;
    register(item.id, handle.current);
    return () => register(item.id, null);
  }, [item.id, register]);

  // One click opens the player, a quick second one favourites instead.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
    },
    [],
  );
  function onMediaClick(event: React.MouseEvent) {
    // Enter or Space on the button: no double to wait for.
    if (event.detail === 0) return onOpen(true);
    if (event.detail > 1) return;
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      onOpen(true);
    }, DOUBLE_CLICK_MS);
  }
  function onMediaDoubleClick() {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = null;
    like();
  }

  async function toggleLater() {
    const next = !later;
    setLater(next);
    try {
      await setWatchLater(item.id, next);
      toast({ title: next ? "Saved to Watch Later" : "Removed from Watch Later", description: item.title });
      void queryClient.invalidateQueries({ queryKey: qk.mediaItems.all });
    } catch (error) {
      setLater(!next);
      toast({
        title: "That didn't work",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  }

  const progress =
    !seen && item.durationSeconds && item.lastPositionSeconds > 0
      ? Math.min(1, item.lastPositionSeconds / item.durationSeconds)
      : 0;
  const lead = performers[0];
  const shownStudio = studio?.name ?? item.studio ?? null;

  return (
    <article
      ref={article}
      className={cn(
        "overflow-hidden border-y border-border bg-card transition-shadow sm:rounded-xl sm:border",
        selected && "ring-2 ring-primary/70",
      )}
    >
      {/* Who it's from, and when */}
      <header className="flex items-center gap-3 px-3 py-2.5">
        {lead ? (
          <Link
            to="/performer/$performerId"
            params={{ performerId: String(lead.id) }}
            className="shrink-0 rounded-full ring-2 ring-sky-500/60 ring-offset-2 ring-offset-card"
          >
            <PerformerAvatar
              name={lead.name}
              src={performerPortraitUrl({ ...lead, representativeItemId: item.id })}
              className="sensitive size-9 rounded-full"
            />
          </Link>
        ) : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
            <Building2 className="size-4 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="sensitive truncate text-sm">
            {lead ? (
              <Link
                to="/performer/$performerId"
                params={{ performerId: String(lead.id) }}
                className="font-semibold hover:underline"
              >
                {joinNames(performers.map((p) => p.name))}
              </Link>
            ) : studio ? (
              <Link
                to="/studio/$studioId"
                params={{ studioId: String(studio.id) }}
                className="font-semibold hover:underline"
              >
                {studio.name}
              </Link>
            ) : null}
            {item.releaseDate && (
              <span className="text-muted-foreground"> · {formatReleaseDate(item.releaseDate)}</span>
            )}
          </p>
          {lead && shownStudio && (
            <p className="sensitive truncate text-xs text-muted-foreground">
              {studio ? (
                <Link
                  to="/studio/$studioId"
                  params={{ studioId: String(studio.id) }}
                  className="hover:text-foreground hover:underline"
                >
                  {shownStudio}
                </Link>
              ) : (
                shownStudio
              )}
            </p>
          )}
        </div>
        {isNew && (
          <span className="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-400">
            New
          </span>
        )}
        <button
          type="button"
          onClick={(event) => onMenu(event, item)}
          aria-label="More"
          title="More"
          className="-mr-1 shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <MoreHorizontal className="size-5" />
        </button>
      </header>

      {/* The video */}
      <button
        type="button"
        ref={media}
        onClick={onMediaClick}
        onDoubleClick={onMediaDoubleClick}
        onContextMenu={(event) => onMenu(event, item)}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        aria-label={`Play ${item.title}`}
        className="group relative block aspect-video w-full select-none overflow-hidden bg-black"
      >
        <img
          src={thumbnailUrl(item)}
          alt=""
          loading="lazy"
          className="sensitive absolute inset-0 size-full object-cover"
        />
        {showPreview && <PreviewClip itemId={item.id} />}
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="flex size-14 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
            <Play className="ml-0.5 size-6 fill-white text-white" />
          </span>
        </span>
        {burst > 0 && (
          <span key={burst} className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Heart className="animate-heart-burst size-24 fill-white text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)]" />
          </span>
        )}
        {progress > 0 && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
            <span className="block h-full bg-red-500" style={{ width: `${progress * 100}%` }} />
          </span>
        )}
      </button>

      {/* Actions */}
      <div className="flex items-center gap-1 px-1.5 pt-1.5">
        <ActionButton
          label={favourite ? "Remove from favourites" : "Favourite"}
          active={favourite}
          onClick={toggleLike}
        >
          <Heart className={cn("size-6", favourite && "fill-red-500 text-red-500")} />
        </ActionButton>
        <ActionButton
          label={later ? "Remove from Watch Later" : "Watch later"}
          active={later}
          onClick={() => void toggleLater()}
        >
          <Clock className={cn("size-6", later && "text-sky-400")} />
        </ActionButton>
        <ActionButton
          label={seen ? "Mark unwatched" : "Mark watched"}
          active={seen}
          onClick={() => {
            setSeen(!seen);
            toggleWatched(item);
          }}
        >
          <CheckCircle2 className={cn("size-6", seen && "text-emerald-400")} />
        </ActionButton>
      </div>

      {/* Caption */}
      <div className="space-y-0.5 px-3 pb-3.5 pt-1.5">
        <button
          type="button"
          onClick={() => onOpen(false)}
          className="sensitive block w-full text-left text-[17px] font-semibold leading-snug text-primary hover:underline"
        >
          {item.title}
        </button>
        {seen && <p className="text-xs text-muted-foreground">Watched</p>}
        {item.description && <Description text={item.description} />}
        {item.tags && item.tags.length > 0 && <Tags tags={item.tags} />}
        <Note itemId={item.id} note={item.note} />
      </div>
    </article>
  );
}

function ActionButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className="rounded-full p-2 text-foreground transition-transform hover:bg-accent active:scale-90"
    >
      {children}
    </button>
  );
}

/**
 * This profile's private note, shown as a comment under the post. Click it,
 * or "Add a note…", to write: Enter saves, Shift+Enter is a new line, Escape
 * leaves it as it was. Saving it empty removes it.
 */
function Note({ itemId, note }: { itemId: number; note: string | null }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [saved, setSaved] = useOptimistic(note);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (draft === null || !field.current) return;
    const node = field.current;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [draft]);

  async function save() {
    if (draft === null) return;
    const next = draft.trim() === "" ? null : draft.trim();
    if (next === saved) return setDraft(null);
    setSaving(true);
    try {
      await setItemNote(itemId, next);
      setSaved(next);
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: qk.mediaItems.all });
    } catch (error) {
      toast({
        title: "Couldn't save the note",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (draft !== null) {
    return (
      <div className="pt-2">
        <textarea
          ref={field}
          autoFocus
          rows={1}
          value={draft}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void save();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setDraft(null);
            }
          }}
          placeholder="Your private note…"
          className="sensitive w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Only you can see this · Enter to save, Esc to cancel
        </p>
      </div>
    );
  }

  return saved ? (
    <button
      type="button"
      onClick={() => setDraft(saved)}
      title="Edit your note"
      className="sensitive block w-full pt-2 text-left text-sm"
    >
      <span className="font-semibold">You</span>{" "}
      <span className="whitespace-pre-line text-foreground/85">{saved}</span>
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setDraft("")}
      className="block pt-2 text-left text-sm text-muted-foreground hover:text-foreground"
    >
      Add a note…
    </button>
  );
}

/**
 * The description, cut to three lines with a "more" to read the rest — only
 * offered when there is a rest to read.
 */
function Description({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setOverflows(node.scrollHeight > node.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div className="pt-1.5 text-sm leading-relaxed text-foreground/85">
      <p ref={ref} className={cn("sensitive whitespace-pre-line", !expanded && "line-clamp-3")}>
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {expanded ? "less" : "more"}
        </button>
      )}
    </div>
  );
}

/** Up to six tags as hashtags, each opening the library on that tag. */
const SHOWN_TAGS = 6;

function Tags({ tags }: { tags: { id: number; name: string }[] }) {
  const shown = tags.slice(0, SHOWN_TAGS);
  const hidden = tags.length - shown.length;
  return (
    <p className="flex flex-wrap gap-x-2 gap-y-0.5 pt-1.5 text-sm">
      {shown.map((tag) => (
        <Link
          key={tag.id}
          to="/browse"
          search={{ tag: tag.name }}
          className="sensitive text-sky-400 hover:underline"
        >
          #{tag.name.replace(/\s+/g, "")}
        </Link>
      ))}
      {hidden > 0 && <span className="text-muted-foreground">+{hidden}</span>}
    </p>
  );
}

/** "Jul 24, 2020" from the "YYYY-MM-DD" the server sends, read as a local date. */
function formatReleaseDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PostSkeleton() {
  return (
    <div className="overflow-hidden border-y border-border bg-card sm:rounded-xl sm:border">
      <div className="flex items-center gap-3 p-3">
        <div className="skeleton size-10 rounded-full" />
        <div className="skeleton h-3.5 w-32 rounded" />
      </div>
      <div className="skeleton aspect-video w-full" />
      <div className="space-y-2 p-3">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/3 rounded" />
      </div>
    </div>
  );
}
