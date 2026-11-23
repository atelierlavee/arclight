// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import type { MediaCardItem } from "@/components/MediaCard";

export type CareerItem = MediaCardItem & { ageAtRelease: number | null };

export type CareerYear = {
  /** Null for the videos with no release date. */
  year: number | null;
  /** The youngest and oldest they were across this year's videos, when known. */
  ages: [number, number] | null;
  items: CareerItem[];
};

export type CareerSummary = {
  first: number | null;
  last: number | null;
  /** Years from the first release to the last, counting both. */
  span: number;
  /** Years with at least one release. */
  activeYears: number;
  firstAge: number | null;
  lastAge: number | null;
  /** The year with the most releases, and how many. */
  busiest: { year: number; count: number } | null;
  undated: number;
};

/**
 * Groups a performer's videos (already oldest release first) into years,
 * with the undated ones in a group of their own at the end. Years with
 * nothing are left out: the timeline marks the gap instead.
 */
export function careerYears(items: CareerItem[]): CareerYear[] {
  const byYear = new Map<number | null, CareerItem[]>();
  for (const item of items) {
    const year = item.releaseDate ? Number(item.releaseDate.slice(0, 4)) : null;
    const group = byYear.get(year) ?? [];
    group.push(item);
    byYear.set(year, group);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a - b))
    .map(([year, group]) => {
      const ages = group.map((item) => item.ageAtRelease).filter((age): age is number => age !== null);
      return {
        year,
        ages: ages.length ? [Math.min(...ages), Math.max(...ages)] : null,
        items: group,
      };
    });
}

export function careerSummary(years: CareerYear[]): CareerSummary {
  const dated = years.filter((group): group is CareerYear & { year: number } => group.year !== null);
  const first = dated[0]?.year ?? null;
  const last = dated.at(-1)?.year ?? null;
  const busiest = dated.reduce<{ year: number; count: number } | null>(
    (best, group) => (!best || group.items.length > best.count ? { year: group.year, count: group.items.length } : best),
    null,
  );
  return {
    first,
    last,
    span: first !== null && last !== null ? last - first + 1 : 0,
    activeYears: dated.length,
    firstAge: dated[0]?.ages?.[0] ?? null,
    lastAge: dated.at(-1)?.ages?.[1] ?? null,
    busiest,
    undated: years.find((group) => group.year === null)?.items.length ?? 0,
  };
}

/** "age 24", "age 24–25", or null when unknown. */
export function ageLabel(ages: [number, number] | null): string | null {
  if (!ages) return null;
  return ages[0] === ages[1] ? `age ${ages[0]}` : `age ${ages[0]}–${ages[1]}`;
}
