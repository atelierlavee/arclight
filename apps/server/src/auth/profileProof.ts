import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { db } from "../db/client.js";
import { profiles, users } from "../db/schema.js";
import { verifyPassword } from "./passwords.js";
import { serialized } from "./serialize.js";

// Failures per account, in a sliding window. The login route has its own
// limiter, but every other place that asks for this password went straight to
// the hash check, so a left-open session could guess it without limit.
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<number, number[]>();

/** Test hook: the counters are process-wide. */
export function resetAccountPasswordFailures(): void {
  failures.clear();
}

/**
 * The account password, checked. Shared by every place that asks for it.
 * Locks out (answers false) after ten wrong guesses in fifteen minutes.
 */
export async function accountPasswordOk(userId: number, accountPassword: unknown): Promise<boolean> {
  if (typeof accountPassword !== "string") return false;
  return serialized(`account-password:${userId}`, async () => {
    const now = Date.now();
    const recent = (failures.get(userId) ?? []).filter((at) => now - at < FAILURE_WINDOW_MS);
    if (recent.length >= MAX_FAILURES) {
      failures.set(userId, recent);
      return false;
    }
    const [account] = await db.select().from(users).where(eq(users.id, userId));
    const ok = account !== undefined && (await verifyPassword(accountPassword, account.passwordHash));
    if (ok) failures.delete(userId);
    else failures.set(userId, [...recent, now]);
    return ok;
  });
}

export type ProofFailure = { error: string; code: string };

/**
 * What a profile has to prove before changing its own secrets (privacy
 * password, vault PIN, passkeys).
 *
 * The owner proves the account password, as before profiles existed — it is
 * the strongest credential and the one that already guards the library.
 * Anyone else proves their own profile PIN when they have one: a housemate
 * must not need the owner's account password to manage their own vault, but
 * someone who walks up to their unlocked profile should still be stopped.
 * A non-owner profile with no PIN has nothing to prove, unless `requirePin`
 * (passkeys: registering one with nothing behind it would let anyone at the
 * keyboard mint a credential).
 *
 * Returns null when proved, otherwise the 403 body to send.
 */
export async function proveProfile(
  request: FastifyRequest,
  proof: { accountPassword?: unknown; profilePin?: unknown },
  options: { requirePin?: boolean } = {},
): Promise<ProofFailure | null> {
  const user = request.user;
  const profile = request.profile;
  if (!user || !profile) return { error: "Not signed in", code: "profile_required" };

  if (profile.isOwner) {
    return (await accountPasswordOk(user.id, proof.accountPassword))
      ? null
      : { error: "That account password isn't right", code: "account_password_required" };
  }

  const [row] = await db
    .select({ pinHash: profiles.pinHash })
    .from(profiles)
    .where(eq(profiles.id, profile.id));
  if (!row?.pinHash) {
    return options.requirePin
      ? { error: "Set a profile PIN first", code: "profile_pin_not_set" }
      : null;
  }
  const ok = typeof proof.profilePin === "string" && (await verifyPassword(proof.profilePin, row.pinHash));
  return ok ? null : { error: "That profile PIN isn't right", code: "profile_pin_required" };
}
