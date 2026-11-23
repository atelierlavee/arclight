// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { playbackWarningFor } from "./compatibility.js";

const mp4 = { codec: "h264", containerFormat: "mov,mp4,m4a,3gp,3g2,mj2" };

describe("playbackWarningFor", () => {
  it("says nothing about a plain H.264 MP4", () => {
    expect(playbackWarningFor("video", mp4)).toBeNull();
  });

  it("ignores non-video items entirely", () => {
    expect(playbackWarningFor("photo", { codec: "vc1" })).toBeNull();
    expect(playbackWarningFor("folder", null)).toBeNull();
  });

  it("warns about the container when only the container is unplayable", () => {
    // An H.264 MKV passes the codec check and still shows a black screen,
    // which is the case that used to slip through silently.
    const warning = playbackWarningFor("video", {
      codec: "h264",
      containerFormat: "matroska,webm",
    });
    expect(warning).toMatch(/container/i);
    expect(warning).not.toMatch(/codec \(/i);
  });

  it("treats VP9 in the same joined format name as a playable WebM", () => {
    // ffprobe reports Matroska and WebM under one name, so the codec is the
    // only thing that can tell them apart.
    expect(
      playbackWarningFor("video", { codec: "vp9", containerFormat: "matroska,webm" })
    ).toBeNull();
  });

  it("warns about the codec alone when the container is fine", () => {
    const warning = playbackWarningFor("video", { ...mp4, codec: "hevc" });
    expect(warning).toMatch(/codec/i);
    expect(warning).not.toMatch(/container \(/i);
  });

  it("names both when both are wrong", () => {
    const warning = playbackWarningFor("video", { codec: "vc1", containerFormat: "asf" });
    expect(warning).toMatch(/vc1/);
    expect(warning).toMatch(/asf/);
  });

  it("stays quiet when it has nothing to judge on", () => {
    expect(playbackWarningFor("video", null)).toBeNull();
    expect(playbackWarningFor("video", {})).toBeNull();
  });
});
