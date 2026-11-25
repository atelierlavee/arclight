// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { createRef } from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MediaItemDetail } from "@/lib/mediaItemApi";
import { PlayerMedia } from "./PlayerMedia";

const hls = vi.hoisted(() => ({
  attachMedia: vi.fn(),
  destroy: vi.fn(),
  isSupported: vi.fn(() => true),
  loadSource: vi.fn(),
  on: vi.fn(),
}));

vi.mock("hls.js", () => ({
  default: class HlsMock {
    static Events = { ERROR: "error", MANIFEST_PARSED: "manifestParsed" };
    static isSupported = hls.isSupported;
    attachMedia = hls.attachMedia;
    destroy = hls.destroy;
    loadSource = hls.loadSource;
    on = hls.on;
  },
}));

const item: MediaItemDetail = {
  id: 8,
  itemType: "video",
  title: "Test video",
  description: null,
  performers: [],
  isFavorite: false,
  kind: "video",
  thumbnailFile: null,
  thumbnailPositionX: 50,
  thumbnailPositionY: 50,
  thumbnailScale: 100,
  tileShape: null,
  rating: null,
  studio: null,
  studioSource: "scanner",
  performersSource: "scanner",
  parentId: null,
  durationSeconds: 30,
  playbackWarning: "This video's container cannot play in a browser.",
  tags: [],
  takenAt: null,
  releaseDate: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  extraMetadata: { codec: "h264", containerFormat: "matroska,webm" },
  lastPositionSeconds: 0,
  watched: false,
  watchedAt: null,
  playCount: 0,
  seriesId: null,
  seasonNumber: null,
  episodeNumber: null,
  episodeTitle: null,
  organisedAt: null,
  oCount: 0,
  watchLaterAt: null,
};

function renderPlayer(video: MediaItemDetail) {
  const videoRef = createRef<HTMLVideoElement>();
  const result = render(
    <PlayerMedia
      item={video}
      videoRef={videoRef}
      mode="playing"
      mini={false}
      seeked={false}
      stillOnly={false}
      castSrc={null}
      subtitleTracks={[]}
      onLoadedMetadata={() => {}}
      onSeeked={() => {}}
      onTimeUpdate={() => {}}
      onPause={() => {}}
      onEnded={() => {}}
      onVolumeChange={() => {}}
    />,
  );
  return { ...result, videoRef };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("PlayerMedia", () => {
  it("uses HLS transcoding when the media metadata says direct playback is unsupported", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sessionId: "session-123" }),
      }),
    );
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});

    const { unmount } = renderPlayer(item);

    await waitFor(() => expect(hls.loadSource).toHaveBeenCalledWith(
      "/api/transcodes/session-123/index.m3u8",
    ));
    expect(hls.attachMedia).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith("/api/media-items/8/transcodes", {
      method: "POST",
    });
    unmount();
  });

  it("keeps compatible videos on the direct stream", () => {
    vi.stubGlobal("fetch", vi.fn());
    const compatible = { ...item, playbackWarning: null };
    const { container } = renderPlayer(compatible);
    expect(container.querySelector("video")).toHaveAttribute("src", "/api/stream/8");
    expect(fetch).not.toHaveBeenCalled();
  });
});
