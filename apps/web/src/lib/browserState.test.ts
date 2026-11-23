// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from "vitest";
import { setStorageProfile } from "./profileStorage";
import { storageKeyFor, syncedName } from "./browserState";

afterEach(() => setStorageProfile(null));

describe("which storage keys are kept on the server", () => {
  it("keeps the current profile's personal keys, by their bare name", () => {
    expect(syncedName("p3:pinned-items", 3)).toBe("pinned-items");
    expect(syncedName("p3:saved-searches", 3)).toBe("saved-searches");
  });

  it("never sends another profile's keys", () => {
    expect(syncedName("p4:pinned-items", 3)).toBeNull();
  });

  it("keeps the bare view choices", () => {
    expect(syncedName("performers-sort", 3)).toBe("performers-sort");
    expect(syncedName("performer-network-pins:studios", 3)).toBe("performer-network-pins:studios");
  });

  it("leaves out what the server already has, or that is not kept", () => {
    expect(syncedName("appearance", 3)).toBeNull();
    expect(syncedName("profiles-storage-migrated", 3)).toBeNull();
    expect(syncedName("p3:something-new", 3)).toBeNull();
  });

  it("uses bare keys on a server without profiles", () => {
    expect(syncedName("pinned-items", null)).toBe("pinned-items");
  });

  it("puts a restored key back where the stores read it", () => {
    setStorageProfile(7);
    expect(storageKeyFor("pinned-items")).toBe("p7:pinned-items");
    expect(storageKeyFor("player-volume")).toBe("player-volume");
    expect(storageKeyFor("nonsense")).toBeNull();
  });
});
