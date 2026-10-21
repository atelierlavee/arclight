import { count } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/client.js";
import { appSettings, webauthnCredentials } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { sweeper } from "./sweep.js";

/**
 * Which sessions have proved the privacy credential recently.
 *
 * In memory, for the same reason the unlock throttle is: the process is
 * single-instance, and a restart clearing this fails closed — everyone is
 * locked again, which is the safe direction for something guarding deletion.
 *
 * This exists because /api/privacy/unlock used to verify the password and
 * then store nothing at all. That is fine for discreet mode, which is a blur
 * the browser applies and can undo anyway. It is not fine for an endpoint
 * that deletes library records: without server state, a UI that asks for a
 * password is a suggestion, and anyone who can reach the API can skip it.
 */
const unlocked = new Map<string, number>();

/**
 * How long proving it lasts.
 *
 * Long enough to work through a list of missing videos without retyping,
 * short enough that walking away from an unlocked machine doesn't leave the
 * delete endpoints open for the rest of the day.
 */
const UNLOCK_TTL_MS = 15 * 60 * 1000;

const sweep = sweeper(unlocked, (expires, now) => expires <= now);

export function markUnlocked(sessionId: string): void {
  sweep();
  unlocked.set(sessionId, Date.now() + UNLOCK_TTL_MS);
}

export function isUnlocked(sessionId: string): boolean {
  const expires = unlocked.get(sessionId);
  if (expires === undefined) return false;
  if (expires <= Date.now()) {
    unlocked.delete(sessionId);
    return false;
  }
  return true;
}

export function lock(sessionId: string): void {
  unlocked.delete(sessionId);
}

/**
 * Whether a privacy credential exists at all.
 *
 * With neither a password nor a passkey there is nothing to prove, and
 * demanding proof would lock the owner out of their own library with no way
 * back. Matches what the client's `usePrivacyGuard` already means by
 * "guarded", so the two cannot disagree about whether a prompt is coming.
 */
export async function privacyIsConfigured(): Promise<boolean> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "privacy"));
  const value = row?.value as { passwordHash?: unknown } | null;
  if (typeof value?.passwordHash === "string") return true;

  const [passkeys] = await db
    .select({ total: count() })
    .from(webauthnCredentials);
  return (passkeys?.total ?? 0) > 0;
}

/**
 * Refuses a request unless its session has recently proved the privacy
 * credential. Returns true when it refused (and has already sent the 403),
 * so a handler reads `if (await privacyLocked(request, reply)) return reply;`.
 *
 * Shared so every destructive or exfiltrating endpoint — deleting records,
 * restoring or downloading a backup, wiping the activity log — answers the
 * same way, with the `privacy_locked` code the client already knows to turn
 * into an unlock prompt. With no credential configured there is nothing to
 * prove, so it lets the request through (see `privacyIsConfigured`).
 */
export async function privacyLocked(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  if (!(await privacyIsConfigured())) return false;
  const sessionId = request.user?.sessionId;
  if (sessionId && isUnlocked(sessionId)) return false;
  reply.code(403).send({ error: "Locked", code: "privacy_locked" });
  return true;
}
