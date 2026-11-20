import { describe, expect, it } from "vitest";
import { arrivedSince, joinNames } from "./feed";

describe("joinNames", () => {
  it("reads naturally for one, two and more", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Alice"])).toBe("Alice");
    expect(joinNames(["Alice", "Bea"])).toBe("Alice and Bea");
    expect(joinNames(["Alice", "Bea", "Cat"])).toBe("Alice, Bea and 1 other");
    expect(joinNames(["Alice", "Bea", "Cat", "Dee"])).toBe("Alice, Bea and 2 others");
  });
});

describe("arrivedSince", () => {
  it("marks only what came after the last visit", () => {
    const lastSeen = new Date(2026, 10, 19).getTime();
    expect(arrivedSince(new Date(2026, 10, 20).toISOString(), lastSeen)).toBe(true);
    expect(arrivedSince(new Date(2026, 10, 18).toISOString(), lastSeen)).toBe(false);
  });

  it("marks nothing on a first visit", () => {
    expect(arrivedSince(new Date(2026, 10, 20).toISOString(), null)).toBe(false);
  });
});
