import { describe, expect, it } from "vitest";
import { ensureScrubSprite, spriteLayout } from "./scrubSprite.js";

describe("spriteLayout", () => {
  it("takes about one frame per ten seconds", () => {
    expect(spriteLayout(300)).toEqual({ count: 30, interval: 10 });
  });

  it("never drops below ten frames on a short clip", () => {
    const { count, interval } = spriteLayout(20);
    expect(count).toBe(10);
    expect(interval).toBe(2);
  });

  it("caps a long video at a hundred frames, spread over its whole length", () => {
    const { count, interval } = spriteLayout(3 * 60 * 60);
    expect(count).toBe(100);
    expect(count * interval).toBe(3 * 60 * 60);
  });
});

describe("ensureScrubSprite", () => {
  it("answers offline, without trying ffmpeg, when the video file is not there", async () => {
    const result = await ensureScrubSprite(
      "/no/such/drive/video.mp4",
      987_654_321,
      "no-such-hash",
      600,
    );
    expect(result).toBe("offline");
  });
});
