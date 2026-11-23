// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { appendUnique, moveQueueItem, prependUnique } from "./queueUtils";
import type { QueueItem } from "./queue";

const first: QueueItem = { id: 1, title: "First" };
const second: QueueItem = { id: 2, title: "Second" };
const third: QueueItem = { id: 3, title: "Third" };

describe("queue ordering", () => {
  it("appends an item once", () => {
    expect(appendUnique([first], second)).toEqual([first, second]);
    expect(appendUnique([first], first)).toEqual([first]);
  });

  it("puts Play Next items first without duplicates", () => {
    expect(prependUnique([second, third], first)).toEqual([
      first,
      second,
      third,
    ]);
    expect(prependUnique([first, second], first)).toEqual([first, second]);
  });

  it("moves an item and leaves boundary moves unchanged", () => {
    expect(moveQueueItem([first, second, third], third.id, -1)).toEqual([
      first,
      third,
      second,
    ]);
    const items = [first, second, third];
    expect(moveQueueItem(items, first.id, -1)).toBe(items);
    expect(moveQueueItem(items, third.id, 1)).toBe(items);
  });
});
