import {
  formatWatchTime,
  localMonth,
  monthRecap,
  recapMonths,
  type HallOfFame,
  type Insights,
  type InsightPerformer,
  type WatchLogEntry,
} from "@/lib/insights";

/**
 * The stats page's own arithmetic: everything it derives from the insights
 * payload before drawing it, kept apart from the components so it can be
 * tested on its own. Nothing here touches React or the DOM.
 */

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// --- Opening ----------------------------------------------------------------

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Every second in the watch log, added up. */
export function totalSeconds(log: WatchLogEntry[]): number {
  return log.reduce((sum, e) => sum + e.seconds, 0);
}

/**
 * The opening's giant number for `shown` seconds (the count-up's current
 * value) out of `total`: hours once there's an hour, to one decimal under
 * ten, otherwise whole minutes.
 */
export function openingFigure(total: number, shown: number): { big: string; unit: string } {
  const hours = total / 3600;
  const big = hours >= 1 ? `${Math.round((shown / 3600) * (hours < 10 ? 10 : 1)) / (hours < 10 ? 10 : 1)}` : `${Math.round(shown / 60)}`;
  const unit = hours >= 1 ? "hours" : "minutes";
  return { big, unit };
}

/** How many performers and studios you've watched, and on how many days. */
export function libraryReach(
  data: Insights,
  days: Map<string, number>,
): { performerCount: number; studioCount: number; activeDays: number } {
  const itemsById = new Map(data.items.map((i) => [i.id, i]));
  const watchedIds = new Set(data.log.map((e) => e.mediaItemId));
  const performerCount = new Set([...watchedIds].flatMap((id) => itemsById.get(id)?.performerIds ?? [])).size;
  const studioCount = new Set([...watchedIds].map((id) => itemsById.get(id)?.studio).filter(Boolean)).size;
  const activeDays = [...days.values()].filter((s) => s >= 60).length;
  return { performerCount, studioCount, activeDays };
}

// --- 01 The podium ----------------------------------------------------------

export type PodiumPlace = { performer: InsightPerformer; detail: string };

/** The three performers on the podium, each with the line shown under them. */
export function podiumTop(hall: HallOfFame, performers: InsightPerformer[]): PodiumPlace[] {
  const byTime = hall.performersByTime.slice(0, 3).map(({ performer, seconds }) => ({
    performer,
    detail: `${formatWatchTime(seconds)} watched`,
  }));
  const taken = new Set(byTime.map((p) => p.performer.id));
  const byVideos = [...performers]
    .filter((p) => !taken.has(p.id) && p.videoCount > 0)
    .sort((a, b) => b.videoCount - a.videoCount || a.name.localeCompare(b.name))
    .slice(0, 3 - byTime.length)
    .map((performer) => ({ performer, detail: `${performer.videoCount} ${performer.videoCount === 1 ? "video" : "videos"}` }));
  return [...byTime, ...byVideos];
}

export type NumberOneTrivia = { lead: number; hasRunnerUp: boolean; monthsRunning: number };

/** How far the #1 video leads your #2, and how many months it's held the top. */
export function numberOneTrivia(data: Insights, itemId: number, seconds: number): NumberOneTrivia {
  const byItem = new Map<number, number>();
  for (const entry of data.log) {
    byItem.set(entry.mediaItemId, (byItem.get(entry.mediaItemId) ?? 0) + entry.seconds);
  }
  const runnerUp = Math.max(0, ...[...byItem.entries()].filter(([id]) => id !== itemId).map(([, s]) => s));
  // Consecutive months, newest back, in which this was the month's most watched.
  let monthsRunning = 0;
  for (const month of recapMonths(data.log)) {
    if (monthRecap(data, month)?.mostWatched?.item.id !== itemId) break;
    monthsRunning++;
  }
  return { lead: seconds - runnerUp, hasRunnerUp: runnerUp > 0, monthsRunning };
}

/** The trivia line under the #1 video, as its separate facts. */
export function numberOneFacts(trivia: NumberOneTrivia): string[] {
  const facts: string[] = [];
  if (trivia.hasRunnerUp && trivia.lead >= 60) facts.push(`${formatWatchTime(trivia.lead)} ahead of your #2`);
  if (trivia.monthsRunning >= 2) facts.push(`#1 for ${trivia.monthsRunning} months running`);
  return facts;
}

// --- 02 Your year -----------------------------------------------------------

/** The last twelve months, oldest first, ending with this one. */
export function lastTwelveMonths(now = new Date()): string[] {
  return Array.from({ length: 12 }, (_, i) => localMonth(new Date(now.getFullYear(), now.getMonth() - 11 + i, 15)));
}

/** Seconds watched in each "YYYY-MM" month, from per-day totals. */
export function monthTotals(months: string[], days: Map<string, number>): number[] {
  return months.map((m) =>
    [...days.entries()].filter(([day]) => day.startsWith(m)).reduce((sum, [, s]) => sum + s, 0),
  );
}

/** The newest month with at least a minute in it, or the last month when none has. */
export function latestMonthWithTime(totals: number[]): number {
  return [...totals].map((t, i) => (t >= 60 ? i : -1)).filter((i) => i >= 0).pop() ?? 11;
}

// --- 03 Habits --------------------------------------------------------------

export function hourName(hour: number): string {
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}

/** Seconds watched by local hour of day, and by weekday from Monday. */
export function watchHistograms(log: WatchLogEntry[]): { byHour: number[]; byWeekday: number[] } {
  const byHour = new Array<number>(24).fill(0);
  const byWeekday = new Array<number>(7).fill(0);
  for (const entry of log) {
    const date = new Date(entry.hour);
    byHour[date.getHours()] += entry.seconds;
    byWeekday[(date.getDay() + 6) % 7] += entry.seconds;
  }
  return { byHour, byWeekday };
}
