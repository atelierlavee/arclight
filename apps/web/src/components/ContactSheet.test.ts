import { describe, expect, it } from "vitest";
import { pickFrames } from "./ContactSheet";
import type { ScrubSprite } from "@/lib/bookmarkApi";

const sprite = (count: number, interval = 10): ScrubSprite => ({
  url: "/x.jpg",
  interval,
  count,
  columns: 10,
  tileWidth: 160,
  tileHeight: 90,
});

describe("pickFrames", () => {
  it("returns every frame when asked for at least as many as there are", () => {
    const frames = pickFrames(sprite(12), Infinity, 120);
    expect(frames.map((f) => f.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(frames[3]).toEqual({ index: 3, seconds: 30, untilSeconds: 40 });
    expect(frames.at(-1)).toEqual({ index: 11, seconds: 110, untilSeconds: 120 });
  });

  it("spreads a smaller selection evenly and starts at the beginning", () => {
    const frames = pickFrames(sprite(100), 20, 1000);
    expect(frames).toHaveLength(20);
    expect(frames[0].index).toBe(0);
    expect(frames[1].index).toBe(5);
    // Each tile stands for the span up to the next one.
    expect(frames[0].untilSeconds).toBe(frames[1].seconds);
  });

  it("never runs past the video's end", () => {
    const frames = pickFrames(sprite(10, 10), Infinity, 95);
    expect(frames.at(-1)?.untilSeconds).toBe(95);
  });
});
