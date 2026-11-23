// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "./passwords.js";

// scrypt at N=2^17 is deliberately slow — that is the point of it — so these
// get more than the default per-test budget.
const TIMEOUT = 20_000;

describe("hashPassword", () => {
  it(
    "produces a salt:key pair of hex",
    async () => {
      const stored = await hashPassword("correct horse battery staple");
      const [salt, key] = stored.split(":");
      expect(salt).toMatch(/^[0-9a-f]{32}$/);
      expect(key).toMatch(/^[0-9a-f]{128}$/);
    },
    TIMEOUT
  );

  it(
    "salts, so the same password never hashes to the same string twice",
    async () => {
      const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);
      expect(a).not.toBe(b);
    },
    TIMEOUT
  );
});

describe("verifyPassword", () => {
  it(
    "accepts the right password and rejects a wrong one",
    async () => {
      const stored = await hashPassword("s3cret-password");
      expect(await verifyPassword("s3cret-password", stored)).toBe(true);
      expect(await verifyPassword("s3cret-passwore", stored)).toBe(false);
    },
    TIMEOUT
  );

  it(
    "is case and whitespace sensitive",
    async () => {
      const stored = await hashPassword("Password1");
      expect(await verifyPassword("password1", stored)).toBe(false);
      expect(await verifyPassword("Password1 ", stored)).toBe(false);
    },
    TIMEOUT
  );

  it("returns false for a malformed stored value instead of throwing", async () => {
    // A truncated or hand-edited row must fail closed, not crash the login.
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "no-colon-here")).toBe(false);
    expect(await verifyPassword("x", ":")).toBe(false);
  });

  it("states a minimum length the API can enforce", () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(8);
  });
});
