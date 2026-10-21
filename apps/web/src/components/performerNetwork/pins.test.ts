import { afterEach, describe, expect, it, vi } from "vitest";
import { readPins, writePins } from "./pins";

describe("network pins", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("round-trips per layout", () => {
    writePins("studios", { 1: [10, 20] });
    expect(readPins("studios")).toEqual({ 1: [10, 20] });
    expect(readPins("videos")).toEqual({});
  });

  it("forgets a layout once nobody is pinned", () => {
    writePins("studios", { 1: [10, 20] });
    writePins("studios", {});
    expect(localStorage.getItem("performer-network-pins:studios")).toBeNull();
  });

  it("reads junk as no pins", () => {
    localStorage.setItem("performer-network-pins:studios", "not json");
    expect(readPins("studios")).toEqual({});
    localStorage.setItem("performer-network-pins:studios", "null");
    expect(readPins("studios")).toEqual({});
  });

  it("shrugs off storage that refuses", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => writePins("studios", { 1: [0, 0] })).not.toThrow();
  });
});
