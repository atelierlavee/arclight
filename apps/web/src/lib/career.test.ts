// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { ageLabel, careerSummary, careerYears, type CareerItem } from "./career";

const item = (id: number, releaseDate: string | null, ageAtRelease: number | null): CareerItem => ({
  id,
  itemType: "video",
  title: `Video ${id}`,
  durationSeconds: 600,
  missingSince: null,
  releaseDate,
  ageAtRelease,
});

describe("careerYears", () => {
  const years = careerYears([
    item(1, "2016-03-01", 21),
    item(2, "2016-11-01", 22),
    item(3, "2019-05-01", 24),
    item(4, null, null),
  ]);

  it("groups by release year, oldest first, undated last", () => {
    expect(years.map((group) => group.year)).toEqual([2016, 2019, null]);
    expect(years[0].items.map((i) => i.id)).toEqual([1, 2]);
  });

  it("keeps the age range within each year", () => {
    expect(years[0].ages).toEqual([21, 22]);
    expect(years[2].ages).toBeNull();
  });

  it("summarises the span, the busiest year and the ages at each end", () => {
    expect(careerSummary(years)).toEqual({
      first: 2016,
      last: 2019,
      span: 4,
      activeYears: 2,
      firstAge: 21,
      lastAge: 24,
      busiest: { year: 2016, count: 2 },
      undated: 1,
    });
  });
});

describe("ageLabel", () => {
  it("collapses a single age and spans a range", () => {
    expect(ageLabel([24, 24])).toBe("age 24");
    expect(ageLabel([24, 25])).toBe("age 24–25");
    expect(ageLabel(null)).toBeNull();
  });
});
