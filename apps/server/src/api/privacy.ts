import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { appSettings, users } from "../db/schema.js";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "../auth/passwords.js";
import { markUnlocked } from "../auth/privacyUnlock.js";
import { sweeper } from "../auth/sweep.js";

const PRIVACY_KEY = "privacy";

type PrivacySettings = { passwordHash: string };

async function getPrivacyHash(): Promise<string | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, PRIVACY_KEY));
  const value = row?.value as Partial<PrivacySettings> | null;
  return typeof value?.passwordHash === "string" ? value.passwordHash : null;
}

/**
 * The password that unlocks discreet mode.
 *
 * Separate from the account password on purpose: this one is typed in front of
 * whoever made you turn discreet mode on in the first place, so it should not
 * be the credential that also grants access to everything.
 *
 * What this is honestly worth: discreet mode is a blur applied in the browser,
 * so anyone who can open devtools or clear site data can undo it. This raises
 * the cost of a glance over your shoulder, not of an actual attacker with your
 * unlocked machine.
 */

/**
 * Failed unlock attempts, per session.
 *
 * In memory rather than a table: the process is single-instance, and a
 * restart clearing the counter costs an attacker the seconds it takes to
 * restart the process. scrypt already makes each guess cost ~100ms; this
 * stops that becoming ten guesses a second over a long afternoon.
 */
const attempts = new Map<string, { count: number; blockedUntil: number; lastAt: number }>();

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

// A counter nobody has touched for an hour is forgotten, provided it is not
// mid-lockout. Without this, every session that ever mistyped once stayed in
// the map until the process restarted.
const FORGET_AFTER_MS = 60 * 60 * 1000;
const sweepAttempts = sweeper(
  attempts,
  (record, now) => record.blockedUntil <= now && now - record.lastAt > FORGET_AFTER_MS,
);
export async function privacyRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/privacy", async () => {
    // Only whether one exists — never the hash itself.
    return { hasPassword: (await getPrivacyHash()) !== null };
  });

  /**
   * Sets or replaces the privacy password.
   *
   * Requires the account password, not the current privacy one: if you've
   * forgotten the privacy password you would otherwise be stuck with discreet
   * mode permanently, and the account password is already the stronger
   * credential.
   */
  app.put<{ Body: { password?: string; accountPassword?: string } }>(
    "/api/privacy/password",
    async (request, reply) => {
      const { password, accountPassword } = request.body ?? {};

      const userId = request.user?.id;
      if (userId === undefined) {
        reply.code(401);
        return { error: "Not signed in" };
      }

      const [account] = await db.select().from(users).where(eq(users.id, userId));
      if (!account || !(await verifyPassword(accountPassword ?? "", account.passwordHash))) {
        reply.code(403);
        return { error: "That account password isn't right" };
      }

      // An empty password clears it — discreet mode then unlocks freely.
      if (!password) {
        await db.delete(appSettings).where(eq(appSettings.key, PRIVACY_KEY));
        return { hasPassword: false };
      }

      if (password.length < MIN_PASSWORD_LENGTH) {
        reply.code(400);
        return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters` };
      }

      const value: PrivacySettings = { passwordHash: await hashPassword(password) };
      await db
        .insert(appSettings)
        .values({ key: PRIVACY_KEY, value })
        .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
      return { hasPassword: true };
    }
  );

  /** Checks the password and, if it's right, releases the session's lock. */
  app.post<{ Body: { password?: string } }>("/api/privacy/unlock", async (request, reply) => {
    if (!request.user) {
      reply.code(401);
      return { error: "Not signed in" };
    }
    const sessionId = request.user.sessionId;

    sweepAttempts();
    const record = attempts.get(sessionId);
    if (record && record.blockedUntil > Date.now()) {
      reply.code(429);
      return {
        ok: false,
        error: "Too many attempts",
        retryAfterSeconds: Math.ceil((record.blockedUntil - Date.now()) / 1000),
      };
    }

    const stored = await getPrivacyHash();
    // Nothing set means nothing to unlock — the client shouldn't be asking,
    // but saying yes is better than trapping someone in discreet mode.
    if (stored === null) return { ok: true };

    if (!(await verifyPassword(request.body?.password ?? "", stored))) {
      const count = (record?.count ?? 0) + 1;
      attempts.set(sessionId, {
        count,
        // Only the run of failures past the limit blocks; the count keeps
        // rising, so each further wrong guess re-arms the same wait rather
        // than granting a fresh batch of free tries.
        blockedUntil: count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0,
        lastAt: Date.now(),
      });
      reply.code(403);
      return { ok: false, error: "Wrong password", attemptsLeft: Math.max(0, MAX_ATTEMPTS - count) };
    }

    attempts.delete(sessionId);
    // Remembered for a while, so endpoints that guard something destructive
    // can ask whether this session has actually proved anything.
    markUnlocked(sessionId);
    return { ok: true };
  });
}
