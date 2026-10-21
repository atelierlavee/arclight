import { afterEach, describe, expect, it } from "vitest";
import {
  clearAllProfileData,
  migrateBareKeysToOwner,
  pkey,
  setStorageProfile,
} from "./profileStorage";
import { recordRecent, readRecent } from "./recent";

afterEach(() => setStorageProfile(null));

describe("profile storage", () => {
  it("keeps keys bare with no profile and namespaces them with one", () => {
    expect(pkey("pinned-items")).toBe("pinned-items");
    setStorageProfile(4);
    expect(pkey("pinned-items")).toBe("p4:pinned-items");
  });

  it("keeps one profile's history away from another", () => {
    setStorageProfile(1);
    recordRecent("played", { id: 7, title: "Seven" });
    setStorageProfile(2);
    expect(readRecent("played")).toEqual([]);
    setStorageProfile(1);
    expect(readRecent("played").map((entry) => entry.id)).toEqual([7]);
  });

  it("moves pre-profile keys to the owner once, leaving device prefs bare", () => {
    localStorage.setItem("pinned-items", "[1]");
    localStorage.setItem("recent-searches", '["old"]');
    localStorage.setItem("p1:recent-searches", '["newer"]');
    localStorage.setItem("sidebar-collapsed", "true");
    sessionStorage.setItem("playback-queue", "[2]");
    sessionStorage.setItem("browse-scroll:x", "10");

    migrateBareKeysToOwner(1);

    expect(localStorage.getItem("p1:pinned-items")).toBe("[1]");
    expect(localStorage.getItem("pinned-items")).toBeNull();
    // An existing namespaced value wins over the old bare one.
    expect(localStorage.getItem("p1:recent-searches")).toBe('["newer"]');
    expect(localStorage.getItem("sidebar-collapsed")).toBe("true");
    expect(sessionStorage.getItem("p1:playback-queue")).toBe("[2]");
    expect(sessionStorage.getItem("p1:browse-scroll:x")).toBe("10");

    // Once only: bare keys written later (single-user mode) stay put.
    localStorage.setItem("pinned-items", "[3]");
    migrateBareKeysToOwner(1);
    expect(localStorage.getItem("pinned-items")).toBe("[3]");
  });

  it("clears every profile's personal keys on sign-out", () => {
    localStorage.setItem("p1:pinned-items", "[1]");
    localStorage.setItem("p2:saved-searches", "[]");
    localStorage.setItem("recent-played", "[]");
    localStorage.setItem("player-volume", "0.5");
    sessionStorage.setItem("p2:dailyPickSeed", "4");

    clearAllProfileData();

    expect(localStorage.getItem("p1:pinned-items")).toBeNull();
    expect(localStorage.getItem("p2:saved-searches")).toBeNull();
    expect(localStorage.getItem("recent-played")).toBeNull();
    expect(sessionStorage.getItem("p2:dailyPickSeed")).toBeNull();
    expect(localStorage.getItem("player-volume")).toBe("0.5");
  });
});
