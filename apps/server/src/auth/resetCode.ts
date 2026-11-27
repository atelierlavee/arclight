// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { BACKUP_DIR } from "../backup/create.js";

/**
 * The last way back in when the password is forgotten and no authenticator
 * is set up: a short-lived code the server writes where only whoever runs
 * the machine can read it — its log, and a file in the backups folder, which
 * is mounted from the host. Reading it proves you hold the server, which on
 * a self-hosted app is what owning it means; anyone who can read those could
 * already edit the database directly, so this hands them nothing new.
 *
 * Held in memory, hashed: a restart forgets it, which only ever means asking
 * for a new one, and the plain code is never stored anywhere the app reads
 * back.
 */

export const RESET_CODE_TTL_MS = 15 * 60 * 1000;
/** One request per this long, so the button can't be used to flood the log. */
const REQUEST_COOLDOWN_MS = 30 * 1000;
/** No 0/O or 1/I/L, so it can be read off a screen and typed without doubt. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const RESET_FILE = path.join(BACKUP_DIR, "password-reset.txt");

let current: { hash: Buffer; expiresAt: number } | null = null;
let lastIssuedAt = 0;

const digest = (code: string) => createHash("sha256").update(normalise(code)).digest();
const normalise = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

function makeCode(): string {
  const chars = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/**
 * Issues a new code, replacing any earlier one. Returns false, issuing
 * nothing, when asked again within the cooldown.
 */
export async function issueResetCode(
  log: (line: string) => void,
  now = Date.now(),
): Promise<boolean> {
  if (now - lastIssuedAt < REQUEST_COOLDOWN_MS) return false;
  lastIssuedAt = now;

  const code = makeCode();
  const expiresAt = now + RESET_CODE_TTL_MS;
  current = { hash: digest(code), expiresAt };
  const until = new Date(expiresAt).toISOString();

  log(`PASSWORD RESET CODE: ${code} (valid until ${until}, single use)`);
  try {
    // The folder only exists once a backup has been made, on a new install.
    await mkdir(BACKUP_DIR, { recursive: true });
    await writeFile(
      RESET_FILE,
      `Arc Light password reset code\n\n    ${code}\n\nValid until ${until}. It works once, and is deleted when used.\n`,
      { mode: 0o600 },
    );
    // writeFile only applies the mode when it creates the file.
    await chmod(RESET_FILE, 0o600);
  } catch {
    // The log line is enough on its own; a read-only folder must not stop it.
  }
  return true;
}

/** Whether `code` is the live one. A match uses it up. */
export async function consumeResetCode(code: unknown, now = Date.now()): Promise<boolean> {
  if (typeof code !== "string" || current === null) return false;
  if (now > current.expiresAt) {
    await clearResetCode();
    return false;
  }
  if (!timingSafeEqual(digest(code), current.hash)) return false;
  await clearResetCode();
  return true;
}

export async function clearResetCode(): Promise<void> {
  current = null;
  await rm(RESET_FILE, { force: true }).catch(() => undefined);
}

/** Test hook: the state is process-wide. */
export function resetResetCodeState(): void {
  current = null;
  lastIssuedAt = 0;
}
