import { getProfileSetting } from "../library/profileSettings.js";
import { forgetSession } from "./profileContext.js";
import { sweeper } from "./sweep.js";

export const VAULT_KEY = "vault";

/**
 * Which session+profile pairs have opened their vault recently, keyed by
 * `unlockKey()` from profileContext.ts. Each profile has its own vault, so
 * opening one never opens another's, and a profile switch clears them all.
 *
 * In memory like the privacy unlock: a restart locks everyone again, which is
 * the safe direction. Shorter than the privacy window because what this guards
 * is being looked at, not a one-off delete.
 */
const unlocked = new Map<string, number>();
const UNLOCK_TTL_MS = 10 * 60 * 1000;

const sweep = sweeper(unlocked, (expires, now) => expires <= now);

export function unlockVault(key: string): void {
  sweep();
  unlocked.set(key, Date.now() + UNLOCK_TTL_MS);
}

export function isVaultUnlocked(key: string | null | undefined): boolean {
  if (!key) return false;
  const expires = unlocked.get(key);
  if (expires === undefined) return false;
  if (expires <= Date.now()) {
    unlocked.delete(key);
    return false;
  }
  return true;
}

export function lockVault(key: string): void {
  unlocked.delete(key);
}

/** Every profile's vault on this session — on a profile switch. */
export function lockVaultSession(sessionId: string): void {
  forgetSession(unlocked, sessionId);
}

export async function getVaultPinHash(profileId: number): Promise<string | null> {
  const value = (await getProfileSetting(profileId, VAULT_KEY)) as { pinHash?: unknown } | null;
  return typeof value?.pinHash === "string" ? value.pinHash : null;
}

/** With no PIN set there is nothing to prove, so nothing to gate. */
export async function vaultPinConfigured(profileId: number): Promise<boolean> {
  return (await getVaultPinHash(profileId)) !== null;
}
