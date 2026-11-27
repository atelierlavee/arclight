// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { splitPart, suggestSeries } from "./seriesSuggestions.js";

describe("splitPart", () => {
  it.each([
    ["LANA Part 5", "LANA", 5],
    ["Lana part 1", "Lana", 1],
    ["The Saga Pt. 3", "The Saga", 3],
    ["Office Affair Vol 2", "Office Affair", 2],
    ["Getaway - Chapter 4", "Getaway", 4],
    ["Story #2", "Story", 2],
    ["Part 2: The Return", "The Return", 2],
  ])("reads %s as %s, part %i", (title, name, part) => {
    expect(splitPart(title)).toEqual({ name, part });
  });

  it("leaves titles without a part marker alone", () => {
    expect(splitPart("Main Event")).toBeNull();
    expect(splitPart("Party Time")).toBeNull();
  });
});

describe("suggestSeries", () => {
  it("groups one studio's parts by name, in part order, whatever the capitals", () => {
    const suggestions = suggestSeries([
      { id: 5, title: "LANA Part 5", studio: "Tushy" },
      { id: 1, title: "Lana part 1", studio: "Tushy" },
      { id: 4, title: "LANA Part 4", studio: "Tushy" },
      { id: 9, title: "Main Event", studio: "Tushy" },
    ]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].name).toBe("Lana");
    expect(suggestions[0].studio).toBe("Tushy");
    expect(suggestions[0].items.map((item) => item.id)).toEqual([1, 4, 5]);
  });

  it("keeps different studios' same-named sagas apart, and needs two different parts", () => {
    const suggestions = suggestSeries([
      { id: 1, title: "Story Part 1", studio: "A" },
      { id: 2, title: "Story Part 2", studio: "B" },
      { id: 3, title: "Lonely Part 1", studio: "A" },
      { id: 4, title: "Lonely Part 1", studio: "A" },
    ]);
    expect(suggestions).toEqual([]);
  });
});
