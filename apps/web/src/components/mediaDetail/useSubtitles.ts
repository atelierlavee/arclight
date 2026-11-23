// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/queryKeys";

export type SubtitleTrack = { index: number; language: string | null; label: string };

/** The subtitle tracks beside a video, as the server found them. */
export function useSubtitleTracks(videoId: number, enabled: boolean): SubtitleTrack[] {
  const { data } = useQuery({
    queryKey: qk.subtitles(videoId),
    queryFn: async () => {
      const res = await fetch(`/api/media-items/${videoId}/subtitles`);
      if (!res.ok) return { tracks: [] as SubtitleTrack[] };
      return (await res.json()) as { tracks: SubtitleTrack[] };
    },
    enabled,
    // The file beside the video can change, but not while it is playing.
    staleTime: 60_000,
  });
  return data?.tracks ?? [];
}

/**
 * Which track is showing: none, or one of the tracks.
 *
 * The tracks are rendered as <track> children, so the browser loads them all;
 * this only decides which one is "showing". "hidden" rather than "disabled"
 * for the rest keeps their cues loaded, so switching is instant. Reapplied
 * whenever the <video> element is replaced (its `key` changes with the mode)
 * or the item changes.
 */
export function useSubtitles({
  videoRef,
  tracks,
  mode,
  videoId,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  tracks: SubtitleTrack[];
  mode: "preview" | "playing";
  videoId: number;
}) {
  const [choice, setChoice] = useState<{ videoId: number; index: number | null }>({ videoId, index: null });
  // Another video starts with subtitles off, derived rather than reset in an
  // effect so there is never a render showing the last video's choice.
  const selected = choice.videoId === videoId ? choice.index : null;

  useEffect(() => {
    const list = videoRef.current?.textTracks;
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      list[i].mode = i === selected ? "showing" : "hidden";
    }
  }, [videoRef, selected, tracks.length, mode, videoId]);

  /** Off, then each track in turn, then off again. */
  function cycle() {
    if (tracks.length === 0) return;
    const next = selected === null ? 0 : selected + 1 < tracks.length ? selected + 1 : null;
    setChoice({ videoId, index: next });
  }

  return {
    selected,
    cycle,
    label: selected === null ? null : (tracks[selected]?.label ?? null),
  };
}
