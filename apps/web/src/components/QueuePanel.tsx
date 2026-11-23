// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { ChevronDown, ChevronUp, List, Play, X } from "lucide-react";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { useQueue } from "@/lib/queue";
import { cn } from "@/lib/utils";

/**
 * Where the queue is sitting, which changes how it handles its own height.
 *
 * `stacked` flows with the page and grows as long as the queue is. `side`
 * fills a column beside the player and scrolls inside itself instead — the
 * point of putting it there is to keep the video visible, which a list that
 * pushes the column taller than the video would defeat.
 */
type QueueVariant = "stacked" | "side";

export function QueuePanel({
  onPlay,
  variant = "stacked",
}: {
  onPlay: (id: number) => void;
  variant?: QueueVariant;
}) {
  const { items, clear, move, remove } = useQueue();
  const side = variant === "side";

  return (
    <section
      className={cn(
        side
          ? // Transparent: sitting over the video, its container already
            // provides the tint and the blur, and a second background on top
            // of that just turns the panel into a grey slab.
            "flex h-full min-h-0 flex-col"
          : "border-t border-border bg-secondary/30 p-5",
      )}
      aria-label="Playback queue"
    >
      <div
        className={cn(
          "flex items-center justify-between gap-3",
          side ? "shrink-0 border-b border-white/10 p-4" : "mb-3",
        )}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <List className="size-4" />
          Queue{" "}
          <span className="text-xs font-normal text-muted-foreground">
            {items.length}
          </span>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="text-xs text-muted-foreground transition-colors hover:text-destructive"
          >
            Clear
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p
          className={cn(
            "text-sm text-muted-foreground",
            side && "p-4 leading-relaxed",
          )}
        >
          Nothing queued yet. Videos you queue will show up here, and play in
          order after this one.
        </p>
      ) : (
        // min-h-0 is what lets this scroll rather than stretch its parent: a
        // flex child's default min-height is its content, so without it the
        // column grows to the length of the queue and the video is pushed off.
        <ol
          className={cn(
            "space-y-2",
            side && "min-h-0 flex-1 overflow-y-auto overscroll-contain p-4",
          )}
        >
          {items.map((queueItem, index) => (
            <li
              key={queueItem.id}
              className={cn(
                "group/row flex items-center gap-2 rounded-md p-2",
                // Just enough lift to separate a row from the video behind it.
                side ? "gap-2.5 bg-white/5 hover:bg-white/10" : "bg-background/60",
              )}
            >
              <img
                src={thumbnailUrl(queueItem)}
                alt=""
                className={cn(
                  "rounded object-cover",
                  // Wider in the column: a 16:9 still at 48px square is
                  // cropped to the middle of a frame and tells you nothing.
                  side ? "h-11 w-16 shrink-0" : "size-12",
                )}
              />
              <button
                type="button"
                onClick={() => onPlay(queueItem.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm hover:text-foreground"
              >
                <span
                  className={cn(
                    "min-w-0 flex-1",
                    // Two lines rather than one truncated to nothing: the
                    // column is narrow, and "Little Caprice Fi…" is not a
                    // title you can choose between.
                    side ? "line-clamp-2 text-xs leading-snug" : "truncate",
                  )}
                >
                  {queueItem.title}
                </span>
                {!side && <Play className="size-3.5 shrink-0" />}
              </button>
              <div
                className={cn(
                  "flex shrink-0 items-center gap-1",
                  // Revealed on hover in the column, where four always-on
                  // controls left the title a dozen characters. Focus shows
                  // them too, so they stay reachable from the keyboard.
                  side &&
                    "opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100",
                )}
              >
                <button
                  type="button"
                  onClick={() => move(queueItem.id, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${queueItem.title} up`}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(queueItem.id, 1)}
                  disabled={index === items.length - 1}
                  aria-label={`Move ${queueItem.title} down`}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(queueItem.id)}
                  aria-label={`Remove ${queueItem.title} from queue`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
