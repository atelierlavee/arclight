// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { localDay, type InsightItem, type Insights } from "./insights";

export type DiaryEntry = {
  item: InsightItem;
  /** Seconds watched of this item on this day. */
  seconds: number;
  /** Counted on this day. */
  oCount: number;
};

export type DiaryDay = {
  /** Local "YYYY-MM-DD". */
  day: string;
  seconds: number;
  oCount: number;
  /** Most watched first. */
  entries: DiaryEntry[];
};

/**
 * One month of the watch log as a diary: the days you watched something,
 * newest first, each with what you watched and for how long.
 *
 * Built from the same hour buckets as the stats page, placed in the
 * viewer's own time zone, so a late night lands on the day it felt like.
 * `month` is "YYYY-MM".
 */
export function diaryMonth(data: Insights, month: string): DiaryDay[] {
  const items = new Map(data.items.map((item) => [item.id, item]));
  const days = new Map<string, { seconds: number; oCount: number; byItem: Map<number, DiaryEntry> }>();

  function dayFor(day: string) {
    let entry = days.get(day);
    if (!entry) {
      entry = { seconds: 0, oCount: 0, byItem: new Map() };
      days.set(day, entry);
    }
    return entry;
  }

  for (const log of data.log) {
    const day = localDay(new Date(log.hour));
    if (!day.startsWith(month)) continue;
    const item = items.get(log.mediaItemId);
    if (!item) continue;
    const bucket = dayFor(day);
    bucket.seconds += log.seconds;
    const entry = bucket.byItem.get(item.id) ?? { item, seconds: 0, oCount: 0 };
    entry.seconds += log.seconds;
    bucket.byItem.set(item.id, entry);
  }

  for (const count of data.oLog ?? []) {
    const day = localDay(new Date(count.at));
    if (!day.startsWith(month)) continue;
    const item = items.get(count.mediaItemId);
    const bucket = dayFor(day);
    bucket.oCount += 1;
    if (item) {
      const entry = bucket.byItem.get(item.id) ?? { item, seconds: 0, oCount: 0 };
      entry.oCount += 1;
      bucket.byItem.set(item.id, entry);
    }
  }

  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, bucket]) => ({
      day,
      seconds: bucket.seconds,
      oCount: bucket.oCount,
      entries: [...bucket.byItem.values()].sort((a, b) => b.seconds - a.seconds),
    }));
}

/** Every "YYYY-MM" with something in the log, newest first. */
export function diaryMonths(data: Insights): string[] {
  const months = new Set<string>();
  for (const log of data.log) months.add(localDay(new Date(log.hour)).slice(0, 7));
  for (const count of data.oLog ?? []) months.add(localDay(new Date(count.at)).slice(0, 7));
  return [...months].sort().reverse();
}

/** True when the item was finished on this local day. */
export function finishedOn(item: InsightItem, day: string): boolean {
  return item.completedAt !== null && localDay(new Date(item.completedAt)) === day;
}
