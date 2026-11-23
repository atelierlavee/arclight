// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { framingStyle, thumbnailUrl } from "./mediaItemApi.js";

describe("thumbnailUrl", () => {
  it("carries a version token so a replaced thumbnail is not cached forever", () => {
    // The endpoint is served immutable for a year; without a changing token
    // every browser would keep showing the old picture.
    expect(thumbnailUrl({ id: 7, thumbnailFile: "7-abc123.jpg" })).toBe(
      "/api/media-items/7/thumbnail?v=7-abc123.jpg&e=2",
    );
  });

  it("uses a stable token when there is no upload", () => {
    expect(thumbnailUrl({ id: 7, thumbnailFile: null })).toBe(
      "/api/media-items/7/thumbnail?v=auto&e=2",
    );
    expect(thumbnailUrl({ id: 7 })).toBe(
      "/api/media-items/7/thumbnail?v=auto&e=2",
    );
  });
});

describe("framingStyle", () => {
  it("returns nothing when the framing is untouched", () => {
    // Grid pages render hundreds of these; an untouched image should not get
    // a style attribute at all.
    expect(framingStyle({})).toBeUndefined();
    expect(
      framingStyle({
        thumbnailPositionX: 50,
        thumbnailPositionY: 50,
        thumbnailScale: 100,
      }),
    ).toBeUndefined();
  });

  it("emits position and zoom once framed", () => {
    expect(
      framingStyle({
        thumbnailPositionX: 33,
        thumbnailPositionY: 0,
        thumbnailScale: 130,
      }),
    ).toEqual({
      objectPosition: "33% 0%",
      transform: "scale(1.3)",
      transformOrigin: "33% 0%",
    });
  });

  it("anchors the zoom to the same point as the crop", () => {
    // Otherwise zooming pulls away from the part you positioned.
    const style = framingStyle({
      thumbnailPositionX: 10,
      thumbnailPositionY: 90,
    });
    expect(style?.transformOrigin).toBe(style?.objectPosition);
  });

  it("reacts to a change in any single axis", () => {
    expect(framingStyle({ thumbnailPositionX: 51 })).toBeDefined();
    expect(framingStyle({ thumbnailPositionY: 49 })).toBeDefined();
    expect(framingStyle({ thumbnailScale: 101 })).toBeDefined();
  });
});
