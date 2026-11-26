// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import {
  CircleCheck,
  Clock,
  Droplets,
  Eye,
  EyeOff,
  Heart,
  LayoutGrid,
  ListEnd,
  ListStart,
  MoreHorizontal,
  Play,
  Trophy,
} from "lucide-react";
import { ContextMenu, type ContextMenuState } from "../ContextMenu";
import { EditableTitle } from "../EditableTitle";
import { formatTimestamp } from "@/lib/bookmarkApi";
import type { MediaItemDetail } from "@/lib/mediaItemApi";
import { cn, formatDuration } from "@/lib/utils";

/** One button inside the grouped action pill. */
function PillAction({
  label,
  onClick,
  pressed,
  disabled,
  children,
}: {
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  pressed?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 md:size-11"
    >
      {children}
    </button>
  );
}

/**
 * The head of the watch page, under the video: where it's from and its name,
 * then play and the everyday actions, with the rarer ones folded into a menu.
 * Who's in it and your rating are in the Overview tab below.
 */
export function WatchMasthead({
  item,
  seriesName,
  playing,
  canResume,
  editing,
  isOwner,
  watchedPending,
  organisedPending,
  hallOfFamePin,
  onStartPlaying,
  onToggleFavorite,
  onToggleWatched,
  onToggleWatchLater,
  onOpenContactSheet,
  onQueue,
  onSetHallOfFamePin,
  onCountO,
  onToggleOrganised,
}: {
  item: MediaItemDetail;
  seriesName: string | null;
  playing: boolean;
  canResume: boolean;
  editing: boolean;
  isOwner: boolean;
  watchedPending: boolean;
  organisedPending: boolean;
  hallOfFamePin: number;
  onStartPlaying: (positionSeconds: number) => void;
  onToggleFavorite: (next: boolean) => void;
  onToggleWatched: (next: boolean) => void;
  onToggleWatchLater: (next: boolean) => void;
  onOpenContactSheet: () => void;
  onQueue: (next: boolean) => void;
  onSetHallOfFamePin: (id: number) => void;
  onCountO: () => void;
  onToggleOrganised: (next: boolean) => void;
}) {
  const isVideo = item.itemType === "video";
  const pinned = hallOfFamePin === item.id;
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const facts = [
    seriesName ?? item.studio,
    seriesName != null && item.seasonNumber != null && item.episodeNumber != null
      ? `S${item.seasonNumber} · E${item.episodeNumber}`
      : null,
    item.releaseDate?.slice(0, 4),
    formatDuration(item.durationSeconds),
  ].filter(Boolean);

  function openMore(event: React.MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({
      x: rect.left,
      y: rect.bottom + 6,
      entries: [
        { label: "Play next", icon: ListStart, onSelect: () => onQueue(true) },
        {
          label: item.watched ? "Mark as unwatched" : "Mark as watched",
          icon: item.watched ? EyeOff : Eye,
          disabled: watchedPending,
          onSelect: () => onToggleWatched(!item.watched),
        },
        {
          label: `Count one (${item.oCount} so far)`,
          icon: Droplets,
          onSelect: onCountO,
        },
        { separator: true },
        {
          label: pinned ? "Unpin from Hall of fame" : "Pin to Hall of fame as #1",
          icon: Trophy,
          checked: pinned,
          onSelect: () => onSetHallOfFamePin(pinned ? 0 : item.id),
        },
        ...(isOwner
          ? [
              {
                label: item.organisedAt === null ? "Mark organised" : "Mark not organised",
                icon: CircleCheck,
                checked: item.organisedAt !== null,
                disabled: organisedPending,
                onSelect: () => onToggleOrganised(item.organisedAt === null),
              },
            ]
          : []),
      ],
    });
  }

  return (
    // The name on the left and what to do with it on the right, on one line;
    // the actions drop beneath the title once the two no longer fit.
    <section className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
      <div className="min-w-0 flex-[1_1_24rem] space-y-3">
        {facts.length > 0 && (
          <p className="sensitive text-sm font-medium text-zinc-400">{facts.join(" · ")}</p>
        )}

        {editing ? (
          <EditableTitle
            itemId={item.id}
            title={item.title}
            className="cursor-text text-3xl font-bold leading-tight tracking-[-0.025em] hover:underline md:text-[2.5rem]"
          />
        ) : (
          <h1 className="sensitive text-3xl font-bold leading-[1.1] tracking-[-0.025em] text-balance md:text-[2.5rem]">
            {item.title}
          </h1>
        )}
      </div>

      {isVideo && (
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 md:pb-1">
          {!playing && (
            <>
              <button
                type="button"
                onClick={() => onStartPlaying(canResume ? item.lastPositionSeconds : 0)}
                title={canResume ? `Resume from ${formatTimestamp(item.lastPositionSeconds)}` : undefined}
                className="flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-bold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Play className="size-[18px] fill-current" />
                {canResume ? "Resume" : "Play"}
              </button>
              {canResume && (
                <button
                  type="button"
                  onClick={() => onStartPlaying(0)}
                  className="h-12 rounded-full bg-white/[0.07] px-5 text-[15px] font-semibold transition-colors hover:bg-white/[0.12]"
                >
                  Start over
                </button>
              )}
            </>
          )}

          <div className="flex h-12 items-center rounded-full bg-white/[0.07] px-0.5">
            <PillAction
              label={item.isFavorite ? "Remove from favourites" : "Favourite"}
              pressed={item.isFavorite}
              onClick={() => onToggleFavorite(!item.isFavorite)}
            >
              <Heart className={cn("size-[19px]", item.isFavorite && "fill-primary text-primary")} />
            </PillAction>
            <PillAction
              label={item.watchLaterAt ? "Remove from Watch Later" : "Watch later"}
              pressed={Boolean(item.watchLaterAt)}
              onClick={() => onToggleWatchLater(!item.watchLaterAt)}
            >
              <Clock className={cn("size-[19px]", item.watchLaterAt && "text-sky-400")} />
            </PillAction>
            <PillAction label="Add to queue" onClick={() => onQueue(false)}>
              <ListEnd className="size-[19px]" />
            </PillAction>
            <PillAction label="Contact sheet (g)" onClick={onOpenContactSheet}>
              <LayoutGrid className="size-[19px]" />
            </PillAction>
            <PillAction label="More actions" onClick={openMore}>
              <MoreHorizontal className="size-[19px]" />
            </PillAction>
          </div>
        </div>
      )}

      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </section>
  );
}
