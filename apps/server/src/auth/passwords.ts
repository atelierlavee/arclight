import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

// promisify picks the 3-argument overload, which drops the options object —
// so the options-taking signature is spelled out here.
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions
) => Promise<Buffer>;

const SALT_BYTES = 16;
const KEY_BYTES = 64;

// Node's defaults are N=16384, r=8, p=1. Raising N is the meaningful knob for
// slowing an offline attacker; 2^17 keeps a login around a tenth of a second
// on modern hardware, which is imperceptible to you and expensive in bulk.
const SCRYPT_OPTIONS = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

export const MIN_PASSWORD_LENGTH = 8;

/** Returns "<salt-hex>:<key-hex>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_BYTES, SCRYPT_OPTIONS);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;

  const expected = Buffer.from(keyHex, "hex");
  // A malformed hash decodes to nothing, and two empty buffers compare equal:
  // without this a corrupted or crafted hash would accept any password.
  if (expected.length === 0) return false;
  const derived = await scrypt(
    password,
    Buffer.from(saltHex, "hex"),
    expected.length,
    SCRYPT_OPTIONS
  );

  // Constant-time: a plain === leaks how much of the hash matched through
  // timing, which is enough to reconstruct it byte by byte.
  return timingSafeEqual(derived, expected);
}
