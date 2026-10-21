import { describe, expect, it } from "vitest";
import { Clock, Medal, Moon, Trophy } from "lucide-react";
import type { Achievement } from "@/lib/insights";
import { badgeIcon, byUnlockedNewest, unlockedOn } from "./badges";

const badge = (id: string, extra: Partial<Achievement> = {}): Achievement => ({
  id,
  title: id,
  description: "",
  earned: true,
  progress: 1,
  ...extra,
});

describe("badgeIcon", () => {
  it("goes by family, then completion, then the badge's own id", () => {
    expect(badgeIcon(badge("watch-time-2", { family: "watch-time" }))).toBe(Clock);
    expect(badgeIcon(badge("x", { family: "unknown" }))).toBe(Trophy);
    expect(badgeIcon(badge("studio-complete"))).toBe(Medal);
    expect(badgeIcon(badge("night-owl"))).toBe(Moon);
    expect(badgeIcon(badge("mystery"))).toBe(Trophy);
  });
});

describe("unlockedOn", () => {
  it("is null without a valid date", () => {
    expect(unlockedOn(undefined)).toBeNull();
    expect(unlockedOn("not a date")).toBeNull();
  });

  it("adds the year only for other years", () => {
    const thisYear = new Date(new Date().getFullYear(), 2, 4).toISOString();
    expect(unlockedOn(thisYear)).not.toMatch(/\d{4}/);
    expect(unlockedOn("2001-03-04T12:00:00Z")).toMatch(/2001/);
  });
});

describe("byUnlockedNewest", () => {
  it("puts undated ones first, then newest to oldest, without touching the input", () => {
    const list = [badge("old"), badge("undated"), badge("new")];
    const sorted = byUnlockedNewest(list, { old: "2026-01-01T00:00:00Z", new: "2026-05-01T00:00:00Z" });
    expect(sorted.map((b) => b.id)).toEqual(["undated", "new", "old"]);
    expect(list.map((b) => b.id)).toEqual(["old", "undated", "new"]);
  });
});
