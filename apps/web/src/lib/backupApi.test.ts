// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backupAgeDays,
  isBackupStale,
  STALE_BACKUP_DAYS,
} from "./backupApi";

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

afterEach(() => vi.useRealTimers());

describe("backupAgeDays", () => {
  it("measures age in days", () => {
    expect(backupAgeDays(daysAgo(3))).toBeCloseTo(3, 1);
  });

  it("returns null for nothing, and for an unparseable date", () => {
    expect(backupAgeDays(null)).toBeNull();
    expect(backupAgeDays(undefined)).toBeNull();
    expect(backupAgeDays("last Tuesday")).toBeNull();
  });
});

describe("isBackupStale", () => {
  it("stays quiet for a recent backup", () => {
    expect(isBackupStale(daysAgo(1))).toBe(false);
    expect(isBackupStale(daysAgo(STALE_BACKUP_DAYS - 1))).toBe(false);
  });

  it("warns once a backup is older than the threshold", () => {
    expect(isBackupStale(daysAgo(STALE_BACKUP_DAYS + 1))).toBe(true);
  });

  // The case the warning most needs to cover. Treating "no data" as "fine" is
  // how a library that has never been backed up never gets one.
  it("treats never having been backed up as stale", () => {
    expect(isBackupStale(undefined)).toBe(true);
    expect(isBackupStale(null)).toBe(true);
  });

  it("treats an unreadable timestamp as stale rather than as fine", () => {
    expect(isBackupStale("not a date")).toBe(true);
  });
});
