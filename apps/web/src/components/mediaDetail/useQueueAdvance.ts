import { useEffect, useRef, useState } from "react";
import type { MediaItemDetail } from "@/lib/mediaItemApi";
import { useQueue } from "@/lib/queue";

/**
 * The play queue as seen from the player: whether its column is open, what
 * plays next, and moving on to it — by hand or when a video ends.
 */
export function useQueueAdvance({
  item,
  viewingId,
  mode,
  mini,
  cinema,
  currentTime,
  autoplayNext,
  markWatched,
  showItem,
  startPlaying,
}: {
  item: MediaItemDetail | undefined;
  viewingId: number;
  mode: "preview" | "playing";
  mini: boolean;
  cinema: boolean;
  currentTime: number;
  autoplayNext: boolean;
  markWatched: () => void;
  showItem: (id: number) => void;
  startPlaying: (positionSeconds: number) => void;
}) {
  const { add, addNext, items: queueItems, remove } = useQueue();
  const autoPlayNext = useRef(false);

  /**
   * The queue column, beside the player so the video stays visible while you
   * pick what is next.
   *
   * Always there once something is queued — hiding what plays next while
   * things are waiting to play is not a preference. The Appearance setting
   * only decides whether the empty column keeps its place.
   *
   * Never in cinema mode, where the point is the video filling the screen, or
   * in the mini player, which has no room for it.
   */
  /**
   * null means "follow the rule below". Q replaces it with a real answer, so
   * a queue with things in it can still be put away for a moment without
   * emptying it, and an empty one can be called up to see what is there.
   */
  const [queueChoice, setQueueChoice] = useState<boolean | null>(null);
  const queueOpen = queueChoice ?? queueItems.length > 0;

  const queueBeside =
    !mini && !cinema && item?.itemType === "video" && queueOpen;

  const nextQueuedItem = item
    ? queueItems.find((queueItem) => queueItem.id !== item.id)
    : undefined;
  const showUpNext =
    mode === "playing" &&
    !!nextQueuedItem &&
    item?.durationSeconds != null &&
    item.durationSeconds - currentTime <= 30;

  function queueCurrent(next: boolean) {
    if (!item || item.itemType !== "video") return;
    const queueItem = {
      id: item.id,
      title: item.title,
      thumbnailFile: item.thumbnailFile,
      durationSeconds: item.durationSeconds,
    };
    if (next) addNext(queueItem);
    else add(queueItem);
  }

  /** Takes this item and the next one off the queue, and starts the next. */
  function playNextQueued() {
    if (!item || !nextQueuedItem) return;
    remove(item.id);
    remove(nextQueuedItem.id);
    autoPlayNext.current = true;
    showItem(nextQueuedItem.id);
  }

  function handleEnded() {
    if (!item || mode !== "playing") return;
    // Marking it watched both resets the position and takes it out of
    // Continue Watching — which a bare position reset never did, since that
    // row only ever filtered on having *some* progress.
    markWatched();
    // With autoplay off the queue is still consumed — the video is finished
    // either way — but nothing starts on its own. The Up Next card is still
    // on screen at this point, so "next" remains one click away.
    if (nextQueuedItem && autoplayNext) playNextQueued();
    else remove(item.id);
  }

  useEffect(() => {
    if (!item || item.id !== viewingId || !autoPlayNext.current) return;
    autoPlayNext.current = false;
    startPlaying(0);
    // startPlaying is rebuilt every render; only the item arriving should run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, viewingId]);

  return {
    queueItems,
    queueOpen,
    setQueueChoice,
    queueBeside,
    nextQueuedItem,
    showUpNext,
    queueCurrent,
    playNextQueued,
    handleEnded,
  };
}
