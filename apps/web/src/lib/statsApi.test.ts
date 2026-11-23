// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { formatBytes } from "./statsApi";

describe("formatBytes", () => {
  it("reports zero without a unit guess", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("uses binary units, matching what the OS reports", () => {
    expect(formatBytes(1024)).toBe("1 KiB");
    expect(formatBytes(1024 ** 2)).toBe("1.0 MiB");
  });

  it("drops the decimal below megabytes, where it is noise", () => {
    expect(formatBytes(1536)).toBe("2 KiB");
  });

  it("keeps one decimal from megabytes up", () => {
    expect(formatBytes(1.5 * 1024 ** 2)).toBe("1.5 MiB");
    expect(formatBytes(2.25 * 1024 ** 3)).toBe("2.3 GiB");
  });

  it("saturates at the largest unit rather than running off the table", () => {
    expect(formatBytes(5 * 1024 ** 5)).toBe("5120.0 TiB");
  });
});
