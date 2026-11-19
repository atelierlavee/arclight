import { describe, expect, it } from "vitest";
import { diaryMonth, diaryMonths, finishedOn } from "./diary";
import type { InsightItem, Insights } from "./insights";

const item = (id: number, completedAt: string | null = null): InsightItem => ({
  id,
  title: `Video ${id}`,
  thumbnailFile: null,
  durationSeconds: 1200,
  rating: null,
  studio: null,
  playCount: 0,
  completedAt,
  performerIds: [],
});

// Local-time hours, so the test reads the same in any time zone.
const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).toISOString();

const data: Insights = {
  items: [item(1, at(2026, 11, 3, 22)), item(2)],
  performers: [],
  studios: [],
  log: [
    { mediaItemId: 1, hour: at(2026, 11, 3, 21), seconds: 600 },
    { mediaItemId: 1, hour: at(2026, 11, 3, 22), seconds: 300 },
    { mediaItemId: 2, hour: at(2026, 11, 3, 23), seconds: 1200 },
    { mediaItemId: 2, hour: at(2026, 11, 10, 20), seconds: 60 },
    { mediaItemId: 2, hour: at(2026, 10, 30, 20), seconds: 60 },
  ],
  oLog: [{ mediaItemId: 1, at: at(2026, 11, 3, 22) }],
};

describe("diaryMonth", () => {
  const days = diaryMonth(data, "2026-11");

  it("lists the month's days newest first", () => {
    expect(days.map((day) => day.day)).toEqual(["2026-11-10", "2026-11-03"]);
  });

  it("totals each day and orders its videos by time watched", () => {
    const third = days[1];
    expect(third.seconds).toBe(2100);
    expect(third.oCount).toBe(1);
    expect(third.entries.map((entry) => [entry.item.id, entry.seconds, entry.oCount])).toEqual([
      [2, 1200, 0],
      [1, 900, 1],
    ]);
  });
});

describe("diaryMonths", () => {
  it("lists every month with activity, newest first", () => {
    expect(diaryMonths(data)).toEqual(["2026-11", "2026-10"]);
  });
});

describe("finishedOn", () => {
  it("is true only on the day it was finished", () => {
    expect(finishedOn(data.items[0], "2026-11-03")).toBe(true);
    expect(finishedOn(data.items[0], "2026-11-04")).toBe(false);
    expect(finishedOn(data.items[1], "2026-11-03")).toBe(false);
  });
});
