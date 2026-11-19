import { describe, expect, it } from "vitest";
import { arrivedAgo, suggestionReasons, type SuggestionFigures } from "./followingApi";

const figures = (overrides: Partial<SuggestionFigures> = {}): SuggestionFigures => ({
  secondsWatched: 0,
  plays: 0,
  oCount: 0,
  favouriteVideos: 0,
  averageRating: null,
  videoCount: 1,
  representativeItemId: null,
  ...overrides,
});

describe("suggestionReasons", () => {
  it("leads with the strongest signals and keeps three", () => {
    expect(
      suggestionReasons(figures({ secondsWatched: 6 * 3600, plays: 2, oCount: 3, favouriteVideos: 1, averageRating: 4.5 })),
    ).toEqual(["6 h watched", "3 counted", "4.5★ on average"]);
  });

  it("says minutes under an hour, and singulars", () => {
    expect(suggestionReasons(figures({ secondsWatched: 600, plays: 1 }))).toEqual(["1 play", "10 min watched"]);
  });

  it("mentions a favourite performer", () => {
    expect(suggestionReasons(figures(), true)).toEqual(["a favourite"]);
  });
});

describe("arrivedAgo", () => {
  const now = new Date("2026-11-19T12:00:00Z").getTime();
  it("reads naturally at each scale", () => {
    expect(arrivedAgo(null, now)).toBeNull();
    expect(arrivedAgo("2026-11-19T08:00:00Z", now)).toBe("today");
    expect(arrivedAgo("2026-11-18T08:00:00Z", now)).toBe("yesterday");
    expect(arrivedAgo("2026-11-14T12:00:00Z", now)).toBe("5 days ago");
    expect(arrivedAgo("2026-10-20T12:00:00Z", now)).toBe("4 weeks ago");
    expect(arrivedAgo("2026-05-19T12:00:00Z", now)).toBe("6 months ago");
  });
});
