// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSubtitles, type SubtitleTrack } from "./useSubtitles";

const tracks: SubtitleTrack[] = [
  { index: 0, language: "en", label: "English" },
  { index: 1, language: "fr", label: "French" },
];

function setup(videoId = 1, list = tracks) {
  const textTracks = [{ mode: "disabled" }, { mode: "disabled" }];
  const videoRef = { current: { textTracks } as unknown as HTMLVideoElement };
  const hook = renderHook(
    ({ id }) => useSubtitles({ videoRef, tracks: list, mode: "playing", videoId: id }),
    { initialProps: { id: videoId } },
  );
  return { ...hook, textTracks };
}

describe("useSubtitles", () => {
  it("steps off → each track → off, showing only the chosen one", () => {
    const { result, textTracks } = setup();
    expect(result.current.selected).toBeNull();
    expect(textTracks.map((t) => t.mode)).toEqual(["hidden", "hidden"]);

    act(() => result.current.cycle());
    expect(result.current.label).toBe("English");
    expect(textTracks.map((t) => t.mode)).toEqual(["showing", "hidden"]);

    act(() => result.current.cycle());
    expect(result.current.label).toBe("French");
    expect(textTracks.map((t) => t.mode)).toEqual(["hidden", "showing"]);

    act(() => result.current.cycle());
    expect(result.current.selected).toBeNull();
    expect(textTracks.map((t) => t.mode)).toEqual(["hidden", "hidden"]);
  });

  it("starts the next video with subtitles off", () => {
    const { result, rerender } = setup(1);
    act(() => result.current.cycle());
    expect(result.current.selected).toBe(0);
    rerender({ id: 2 });
    expect(result.current.selected).toBeNull();
  });

  it("does nothing when there are no tracks", () => {
    const { result } = setup(1, []);
    act(() => result.current.cycle());
    expect(result.current.selected).toBeNull();
  });
});
