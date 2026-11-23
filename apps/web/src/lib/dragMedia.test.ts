// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  isMediaDrag,
  MEDIA_DRAG_TYPE,
  readMediaDragData,
  setMediaDragData,
} from "./dragMedia";

/** jsdom has no DataTransfer, and only these four members are used. */
function fakeTransfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    effectAllowed: "none",
    get types() {
      return [...store.keys()];
    },
    setData: (type: string, value: string) => store.set(type, value),
    getData: (type: string) => store.get(type) ?? "",
  } as unknown as DataTransfer;
}

describe("media drag payload", () => {
  it("round-trips ids and a label", () => {
    const transfer = fakeTransfer();
    setMediaDragData(transfer, { ids: [1, 2, 3], label: "3 items" });
    expect(readMediaDragData(transfer)).toEqual({
      ids: [1, 2, 3],
      label: "3 items",
    });
  });

  // So a drag from the grid dropped into a text field leaves something
  // meaningful rather than a JSON blob.
  it("also writes a plain-text fallback", () => {
    const transfer = fakeTransfer();
    setMediaDragData(transfer, { ids: [1], label: "One Video" });
    expect(transfer.getData("text/plain")).toBe("One Video");
  });

  it("ignores a drag that isn't ours", () => {
    const transfer = fakeTransfer();
    transfer.setData("text/plain", "some text");
    expect(isMediaDrag(transfer)).toBe(false);
    expect(readMediaDragData(transfer)).toBeNull();
  });

  it("recognises its own type during a drag", () => {
    const transfer = fakeTransfer();
    setMediaDragData(transfer, { ids: [1], label: "x" });
    expect(isMediaDrag(transfer)).toBe(true);
    expect(isMediaDrag(null)).toBe(false);
  });

  it("survives a malformed payload rather than throwing mid-drop", () => {
    const transfer = fakeTransfer();
    transfer.setData(MEDIA_DRAG_TYPE, "{not json");
    expect(readMediaDragData(transfer)).toBeNull();
  });

  // This crosses a serialisation boundary, and a non-numeric id would become
  // "NaN" in a request path.
  it("drops ids that aren't numbers", () => {
    const transfer = fakeTransfer();
    transfer.setData(
      MEDIA_DRAG_TYPE,
      JSON.stringify({ ids: [1, "2", null, 3], label: "x" }),
    );
    expect(readMediaDragData(transfer)?.ids).toEqual([1, 3]);
  });

  it("treats an empty id list as no payload", () => {
    const transfer = fakeTransfer();
    transfer.setData(MEDIA_DRAG_TYPE, JSON.stringify({ ids: [], label: "x" }));
    expect(readMediaDragData(transfer)).toBeNull();
  });
});
