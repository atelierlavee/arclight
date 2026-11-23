// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MediaItemDetail } from "@/lib/mediaItemApi";
import { bestPartSeconds } from "@/lib/heatmap";
import { clipStart, endLeanBack, useLeanBackSession } from "@/lib/leanBack";
import { qk } from "@/lib/queryKeys";

export async function fetchHeatmap(id: number): Promise<{ buckets: number[] }> {
  const res = await fetch(`/api/media-items/${id}/heatmap`);
  if (!res.ok) return { buckets: [] };
  return res.json() as Promise<{ buckets: number[] }>;
}

/**
 * The player's half of lean-back mode (lib/leanBack.ts).
 *
 * Split in two because the pieces are needed at different points in the
 * modal: where a video starts has to be known before playback begins, and
 * moving on needs the queue, which is set up after it.
 */
export function useLeanBackStart() {
  const session = useLeanBackSession();
  const queryClient = useQueryClient();
  /** Where the current clip stops, for the item it belongs to. */
  const clipEnd = useRef<{ id: number; at: number } | null>(null);

  /** The position a video should start from; the requested one outside a clip session. */
  function resolveStart(item: MediaItemDetail, requested: number): number {
    if (!session?.clipSeconds) {
      clipEnd.current = null;
      return requested;
    }
    const buckets = queryClient.getQueryData<{ buckets: number[] }>(qk.heatmap(item.id))?.buckets;
    const duration = item.durationSeconds;
    const start = clipStart(
      item.id,
      duration,
      session.clipSeconds,
      bestPartSeconds(buckets, duration ?? 0),
    );
    clipEnd.current = { id: item.id, at: start + session.clipSeconds };
    return start;
  }

  return { session, clipEnd, resolveStart };
}

export function useLeanBackDriver({
  session,
  clipEnd,
  item,
  mode,
  mini,
  cinema,
  setCinema,
  currentTime,
  nextQueuedId,
  playNextQueued,
  videoRef,
}: {
  session: ReturnType<typeof useLeanBackSession>;
  clipEnd: React.RefObject<{ id: number; at: number } | null>;
  item: MediaItemDetail | undefined;
  mode: "preview" | "playing";
  mini: boolean;
  cinema: boolean;
  setCinema: (cinema: boolean) => void;
  currentTime: number;
  nextQueuedId: number | undefined;
  playNextQueued: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const queryClient = useQueryClient();

  // Cinema once, when the session's first video starts. Not forced after
  // that: leaving cinema mode is a choice the session should respect.
  const cinemaApplied = useRef(false);
  useEffect(() => {
    if (!session) {
      cinemaApplied.current = false;
      return;
    }
    if (mode === "playing" && !mini && !cinema && !cinemaApplied.current) {
      cinemaApplied.current = true;
      setCinema(true);
    }
  }, [session, mode, mini, cinema, setCinema]);

  // The next video's heatmap, ahead of time, so its clip can start at its
  // best part rather than a guess.
  useEffect(() => {
    if (!session?.clipSeconds || nextQueuedId === undefined) return;
    void queryClient.prefetchQuery({
      queryKey: qk.heatmap(nextQueuedId),
      queryFn: () => fetchHeatmap(nextQueuedId),
      staleTime: 60_000,
    });
  }, [session, nextQueuedId, queryClient]);

  /** On to the next video, or the end of the session when there is none. */
  function advance() {
    clipEnd.current = null;
    if (nextQueuedId !== undefined) {
      playNextQueued();
    } else {
      videoRef.current?.pause();
      endLeanBack();
    }
  }

  // The clip is over.
  useEffect(() => {
    const end = clipEnd.current;
    if (!session?.clipSeconds || !end || !item || end.id !== item.id || mode !== "playing") return;
    if (currentTime >= end.at) advance();
    // advance is rebuilt every render; only the clock should run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime]);

  return { advance };
}
