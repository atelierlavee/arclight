// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  totpAt,
  totpStep,
  totpUri,
  verifyTotp,
} from "./totp.js";

// RFC 6238 appendix B: the SHA-1 seed is the ASCII string "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("totp", () => {
  it("matches the RFC 6238 test vectors", () => {
    // The RFC lists 8-digit codes; the last six are what a 6-digit app shows.
    const vectors: [number, string][] = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
    ];
    for (const [seconds, code] of vectors) {
      expect(totpAt(RFC_SECRET, totpStep(seconds * 1000), 8)).toBe(code);
      expect(totpAt(RFC_SECRET, totpStep(seconds * 1000))).toBe(code.slice(2));
    }
  });

  it("round-trips base32", () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(base32Decode("jbsw y3dp-ehpk")).toEqual(base32Decode("JBSWY3DPEHPK"));
  });

  it("generates 32-character secrets", () => {
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("accepts the current code and one step either side, and nothing further", () => {
    const secret = generateTotpSecret();
    const now = 1_800_000_000_000;
    const step = totpStep(now);
    expect(verifyTotp(secret, totpAt(secret, step), now, null)).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step + 1), now, null)).toBe(step + 1);
    expect(verifyTotp(secret, totpAt(secret, step - 2), now, null)).toBeNull();
  });

  it("refuses a code from a step already used", () => {
    const secret = generateTotpSecret();
    const now = 1_800_000_000_000;
    const step = totpStep(now);
    expect(verifyTotp(secret, totpAt(secret, step), now, step)).toBeNull();
  });

  it("refuses anything that isn't six digits", () => {
    const secret = generateTotpSecret();
    for (const code of [undefined, 123456, "12345", "1234567", "abcdef", ""]) {
      expect(verifyTotp(secret, code, Date.now(), null)).toBeNull();
    }
  });

  it("builds an otpauth link an authenticator can read", () => {
    const uri = totpUri("ABC", "me");
    expect(uri.startsWith("otpauth://totp/Arc%20Light%3Ame?")).toBe(true);
    expect(uri).toContain("secret=ABC");
    expect(uri).toContain("issuer=Arc+Light");
  });
});
