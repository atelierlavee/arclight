// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Time-based one-time passwords (RFC 6238), the six digits every
 * authenticator app shows — Google Authenticator, Authy, 1Password and the
 * rest all speak this one standard, so nothing here is tied to any of them.
 *
 * Built on node:crypto rather than a library: it is an HMAC-SHA1 of a counter
 * and a few lines of truncation, and a dependency for that is more code to
 * trust than the thing itself.
 */

/** Seconds each code lasts. Every authenticator app assumes 30. */
export const TOTP_PERIOD = 30;
const DIGITS = 6;
/** Steps either side of now that still count, for a phone clock a little off. */
const DRIFT_STEPS = 1;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("Not a base32 secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit secret, base32 as authenticator apps expect it. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The time step a moment falls in. */
export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD);
}

/** The code for one time step (RFC 4226's HOTP over the step counter). */
export function totpAt(secret: string, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/**
 * The step a code belongs to, or null when it isn't valid now.
 *
 * `afterStep` is the last step already used: a code at or before it is
 * refused, so a code read over your shoulder can't be replayed in the
 * seconds it would otherwise still be good for.
 */
export function verifyTotp(
  secret: string,
  code: unknown,
  nowMs: number,
  afterStep: number | null,
): number | null {
  if (typeof code !== "string") return null;
  const digits = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) return null;
  const now = totpStep(nowMs);
  for (let step = now - DRIFT_STEPS; step <= now + DRIFT_STEPS; step++) {
    if (afterStep !== null && step <= afterStep) continue;
    // Constant-time, though at six digits it is the attempt limit that matters.
    if (timingSafeEqual(Buffer.from(totpAt(secret, step)), Buffer.from(digits))) return step;
  }
  return null;
}

/** The otpauth:// link an authenticator app reads from the QR code. */
export function totpUri(secret: string, account: string, issuer = "Arc Light"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(TOTP_PERIOD) });
  return `otpauth://totp/${label}?${params}`;
}
