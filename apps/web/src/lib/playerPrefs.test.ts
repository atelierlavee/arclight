// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAYBACK_RATES, readRate, readVolume, writeRate, writeVolume } from "./playerPrefs.js";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("volume", () => {
  it("defaults to full volume when nothing is stored", () => {
    expect(readVolume()).toBe(1);
  });

  it("round-trips a value", () => {
    writeVolume(0.42);
    expect(readVolume()).toBeCloseTo(0.42, 5);
  });

  it("treats a stored 0 as a real choice, not a missing value", () => {
    // Silence is a deliberate setting; falling back to 1 would un-mute you.
    writeVolume(0);
    expect(readVolume()).toBe(0);
  });

  it("clamps out-of-range values on the way in", () => {
    writeVolume(5);
    expect(readVolume()).toBe(1);
    writeVolume(-5);
    expect(readVolume()).toBe(0);
  });

  it("falls back when the stored value is not a number", () => {
    localStorage.setItem("player-volume", "loud");
    expect(readVolume()).toBe(1);
  });
});

describe("playback rate", () => {
  it("defaults to normal speed", () => {
    expect(readRate()).toBe(1);
  });

  it("round-trips an offered rate", () => {
    writeRate(1.5);
    expect(readRate()).toBe(1.5);
  });

  it("rejects a rate outside the offered set", () => {
    // A hand-edited value must not leave playback stuck somewhere the menu
    // can't get you back from.
    localStorage.setItem("player-rate", "17");
    expect(readRate()).toBe(1);
  });

  it("offers normal speed among its rates", () => {
    expect(PLAYBACK_RATES).toContain(1);
  });
});

describe("when localStorage is unavailable", () => {
  it("reads fall back instead of throwing", () => {
    // Some privacy configurations throw on access rather than returning null;
    // an unguarded read here would take down the whole modal.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(readVolume()).toBe(1);
    expect(readRate()).toBe(1);
  });

  it("writes fail silently instead of throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => writeVolume(0.5)).not.toThrow();
    expect(() => writeRate(2)).not.toThrow();
  });
});
