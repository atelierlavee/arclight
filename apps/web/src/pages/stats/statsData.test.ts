import { describe, expect, it } from "vitest";
import type { HallOfFame, Insights, InsightItem, InsightPerformer, WatchLogEntry } from "@/lib/insights";
import {
  greeting,
  hourName,
  latestMonthWithTime,
  lastTwelveMonths,
  libraryReach,
  monthTotals,
  numberOneFacts,
  numberOneTrivia,
  openingFigure,
  podiumTop,
  totalSeconds,
  watchHistograms,
} from "./statsData";

const item = (id: number, extra: Partial<InsightItem> = {}): InsightItem => ({
  id,
  title: `Video ${id}`,
  thumbnailFile: null,
  durationSeconds: 600,
  rating: null,
  studio: null,
  playCount: 0,
  completedAt: null,
  performerIds: [],
  ...extra,
});

const performer = (id: number, name: string, videoCount = 0): InsightPerformer => ({
  id,
  name,
  hasImage: false,
  hasBanner: false,
  imagePositionX: 50,
  imagePositionY: 50,
  imageScale: 1,
  avatarPositionX: null,
  avatarPositionY: null,
  avatarScale: null,
  representativeItemId: null,
  videoCount,
  finishedCount: 0,
});

/** A log entry at a local wall-clock time, so hour/weekday maths is zone-proof. */
const at = (mediaItemId: number, y: number, m: number, d: number, h: number, seconds: number): WatchLogEntry => ({
  mediaItemId,
  hour: new Date(y, m - 1, d, h).toISOString(),
  seconds,
});

const insights = (extra: Partial<Insights>): Insights => ({ log: [], items: [], performers: [], studios: [], ...extra });

describe("greeting", () => {
  it("follows the local hour", () => {
    expect(greeting(new Date(2026, 0, 1, 2))).toBe("Up late");
    expect(greeting(new Date(2026, 0, 1, 5))).toBe("Good morning");
    expect(greeting(new Date(2026, 0, 1, 12))).toBe("Good afternoon");
    expect(greeting(new Date(2026, 0, 1, 18))).toBe("Good evening");
  });
});

describe("openingFigure", () => {
  it("counts minutes under an hour", () => {
    expect(openingFigure(1800, 1800)).toEqual({ big: "30", unit: "minutes" });
  });

  it("shows one decimal of hours under ten, whole hours above", () => {
    expect(openingFigure(5400, 5400)).toEqual({ big: "1.5", unit: "hours" });
    expect(openingFigure(15 * 3600 + 1800, 15 * 3600 + 1800)).toEqual({ big: "16", unit: "hours" });
  });

  it("formats the count-up's current value in the total's unit", () => {
    expect(openingFigure(7200, 0)).toEqual({ big: "0", unit: "hours" });
  });
});

describe("totalSeconds and libraryReach", () => {
  it("adds up the log and counts distinct performers, studios and active days", () => {
    const data = insights({
      items: [
        item(1, { performerIds: [10, 11], studio: "A" }),
        item(2, { performerIds: [11], studio: "B" }),
        item(3, { performerIds: [12], studio: "C" }),
      ],
      log: [
        { mediaItemId: 1, hour: "2026-01-01T10:00:00Z", seconds: 100 },
        { mediaItemId: 2, hour: "2026-01-02T10:00:00Z", seconds: 50 },
      ],
    });
    const days = new Map([
      ["2026-01-01", 100],
      ["2026-01-02", 50],
    ]);
    expect(totalSeconds(data.log)).toBe(150);
    expect(libraryReach(data, days)).toEqual({ performerCount: 2, studioCount: 2, activeDays: 1 });
  });
});

describe("podiumTop", () => {
  const hall = (performersByTime: HallOfFame["performersByTime"]): HallOfFame => ({
    mainEvent: null,
    performersByTime,
    videosByPlays: [],
    videosByRating: [],
  });

  it("ranks by time watched first, at most three", () => {
    const [a, b, c, d] = [performer(1, "A"), performer(2, "B"), performer(3, "C"), performer(4, "D")];
    const top = podiumTop(
      hall([
        { performer: a, seconds: 7200 },
        { performer: b, seconds: 600 },
        { performer: c, seconds: 120 },
        { performer: d, seconds: 60 },
      ]),
      [],
    );
    expect(top.map((p) => p.performer.id)).toEqual([1, 2, 3]);
    expect(top[0].detail).toBe("2 h watched");
  });

  it("fills empty places by video count, skipping who's already up", () => {
    const a = performer(1, "A", 9);
    const top = podiumTop(hall([{ performer: a, seconds: 600 }]), [
      a,
      performer(2, "Zed", 3),
      performer(3, "Amy", 3),
      performer(4, "One", 1),
      performer(5, "None", 0),
    ]);
    expect(top.map((p) => p.performer.name)).toEqual(["A", "Amy", "Zed"]);
    expect(top[1].detail).toBe("3 videos");
    expect(podiumTop(hall([]), [performer(4, "One", 1)])[0].detail).toBe("1 video");
  });
});

describe("numberOneTrivia and numberOneFacts", () => {
  it("measures the lead over #2 and the months held at the top", () => {
    const data = insights({
      items: [item(1), item(2)],
      log: [at(1, 2026, 3, 5, 20, 3000), at(2, 2026, 3, 6, 20, 600), at(1, 2026, 2, 5, 20, 900), at(2, 2026, 1, 5, 20, 900)],
    });
    const trivia = numberOneTrivia(data, 1, 3900);
    expect(trivia).toEqual({ lead: 2400, hasRunnerUp: true, monthsRunning: 2 });
    expect(numberOneFacts(trivia)).toEqual(["40 min ahead of your #2", "#1 for 2 months running"]);
  });

  it("says nothing when there's no rival and only one month", () => {
    const data = insights({ items: [item(1)], log: [at(1, 2026, 3, 5, 20, 600)] });
    const trivia = numberOneTrivia(data, 1, 600);
    expect(trivia).toEqual({ lead: 600, hasRunnerUp: false, monthsRunning: 1 });
    expect(numberOneFacts(trivia)).toEqual([]);
  });
});

describe("your year", () => {
  it("lists the last twelve months, oldest first, across a year boundary", () => {
    const months = lastTwelveMonths(new Date(2026, 1, 10));
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-03");
    expect(months[11]).toBe("2026-02");
  });

  it("totals each month and picks the newest with a minute in it", () => {
    const days = new Map([
      ["2026-01-03", 100],
      ["2026-01-20", 50],
      ["2026-02-01", 30],
    ]);
    const totals = monthTotals(["2025-12", "2026-01", "2026-02"], days);
    expect(totals).toEqual([0, 150, 30]);
    expect(latestMonthWithTime(totals)).toBe(1);
    expect(latestMonthWithTime([0, 0, 59])).toBe(11);
  });
});

describe("habits", () => {
  it("names hours on a twelve-hour clock", () => {
    expect(hourName(0)).toBe("12 am");
    expect(hourName(9)).toBe("9 am");
    expect(hourName(12)).toBe("12 pm");
    expect(hourName(23)).toBe("11 pm");
  });

  it("buckets time by local hour and by weekday from Monday", () => {
    // 2026-10-19 is a Monday, 2026-10-25 a Sunday.
    const { byHour, byWeekday } = watchHistograms([at(1, 2026, 10, 19, 22, 100), at(1, 2026, 10, 25, 22, 50), at(1, 2026, 10, 25, 8, 5)]);
    expect(byHour).toHaveLength(24);
    expect(byHour[22]).toBe(150);
    expect(byHour[8]).toBe(5);
    expect(byWeekday).toEqual([100, 0, 0, 0, 0, 0, 55]);
  });
});
