import { describe, expect, it } from "vitest";
import { clipStart } from "./leanBack";

describe("clipStart", () => {
  it("starts at the best part when there is one", () => {
    expect(clipStart(1, 1800, 300, 600)).toBe(600);
  });

  it("never starts so late that the clip runs off the end", () => {
    expect(clipStart(1, 1800, 300, 1700)).toBe(1500);
  });

  it("plays a video shorter than the clip from the start", () => {
    expect(clipStart(1, 200, 300, 50)).toBe(0);
    expect(clipStart(1, null, 300, null)).toBe(0);
  });

  it("without a best part, picks a stable point a fifth to a half of the way in", () => {
    const start = clipStart(42, 3600, 120, null);
    expect(start).toBeGreaterThanOrEqual(3600 * 0.2);
    expect(start).toBeLessThanOrEqual(3600 * 0.5);
    expect(clipStart(42, 3600, 120, null)).toBe(start);
  });
});
