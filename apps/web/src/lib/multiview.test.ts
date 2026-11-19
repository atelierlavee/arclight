import { describe, expect, it } from "vitest";
import { MULTIVIEW_MAX, parseMultiviewIds } from "./multiview";

describe("parseMultiviewIds", () => {
  it("reads whole positive ids and drops the rest", () => {
    expect(parseMultiviewIds("3, 7,abc,-2,0,1.5,9")).toEqual([3, 7, 9]);
  });

  it("drops repeats and stops at the maximum", () => {
    expect(parseMultiviewIds("1,1,2,3,4,5,6")).toEqual([1, 2, 3, 4]);
    expect(parseMultiviewIds("1,2,3,4,5")).toHaveLength(MULTIVIEW_MAX);
  });

  it("is empty for nothing", () => {
    expect(parseMultiviewIds(undefined)).toEqual([]);
    expect(parseMultiviewIds("")).toEqual([]);
  });
});
