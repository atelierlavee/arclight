// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { SLIDESHOW_SPEEDS, nextSlideshowSpeed } from "./slideshow";

describe("nextSlideshowSpeed", () => {
  it("steps through the speeds and wraps round", () => {
    expect(nextSlideshowSpeed(3)).toBe(5);
    expect(nextSlideshowSpeed(15)).toBe(SLIDESHOW_SPEEDS[0]);
  });

  it("starts from the first speed when given one it does not know", () => {
    expect(nextSlideshowSpeed(7)).toBe(SLIDESHOW_SPEEDS[0]);
  });
});
