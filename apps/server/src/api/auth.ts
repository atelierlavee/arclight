import { and, eq, ne, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "../auth/passwords.js";
import {
  createSession,
  destroySession,
  hasAnyUser,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "../auth/sessions.js";

// Deliberately vague: distinguishing "no such user" from "wrong password"
// tells an attacker which usernames exist.
const INVALID_CREDENTIALS = "Incorrect username or password";

// Enough to make online guessing useless without ever locking you out for
// long. Keyed in memory: a single-instance app, and losing the counter on
// restart is not worth a table.
//
// A sliding window rather than a fixed one: each failure ages out on its own
// fifteen minutes after it happened, so a lockout always ends a fixed time
// after the guessing stops, and an attacker cannot line a burst up against a
// window boundary to get twice the budget.
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, number[]>();

// Keyed by IP, but without a trusted proxy (see trustProxySetting in
// buildApp) request.ip is often the Docker bridge gateway for every client,
// so the per-IP limit is in practice already global. This backstop is what
// still holds when it is not — with TRUST_PROXY on, or several addresses —
// so spreading guesses across addresses buys a bounded number of them.
const GLOBAL_KEY = "*";
const MAX_GLOBAL_ATTEMPTS = 50;

function recent(key: string, now: number): number[] {
  const kept = (attempts.get(key) ?? []).filter((at) => now - at < ATTEMPT_WINDOW_MS);
  if (kept.length === 0) attempts.delete(key);
  else attempts.set(key, kept);
  return kept;
}

/** Seconds until another attempt is allowed, or 0 when one is allowed now. */
function retryAfterSeconds(ip: string): number {
  const now = Date.now();
  // Swept on every check: the map is keyed by caller-controlled addresses,
  // so it must not keep keys whose failures have all aged out.
  for (const key of attempts.keys()) recent(key, now);
  let wait = 0;
  for (const [key, limit] of [[ip, MAX_ATTEMPTS], [GLOBAL_KEY, MAX_GLOBAL_ATTEMPTS]] as const) {
    const failures = recent(key, now);
    if (failures.length >= limit) {
      // The window reopens when enough of the oldest failures have aged out
      // to bring the count back under the limit.
      const reopensAt = failures[failures.length - limit] + ATTEMPT_WINDOW_MS;
      wait = Math.max(wait, reopensAt - now);
    }
  }
  return Math.ceil(wait / 1000);
}

function recordFailure(ip: string): void {
  const now = Date.now();
  for (const [key, limit] of [[ip, MAX_ATTEMPTS], [GLOBAL_KEY, MAX_GLOBAL_ATTEMPTS]] as const) {
    // Capped at the limit: past it only the newest timestamps matter, and an
    // uncapped list is memory an attacker gets to allocate.
    attempts.set(key, [...recent(key, now), now].slice(-limit));
  }
}

/** Test hook: the counters are process-wide, so suites reset them between cases. */
export function resetLoginAttempts(): void {
  attempts.clear();
}

// Any fixed 64-bit key, shared by every first-run setup request. Only setup
// takes it, so it cannot contend with anything else.
const SETUP_LOCK_KEY = 0x41524331; // "ARC1"

export function setSessionCookie(reply: FastifyReply, sessionId: string, secure: boolean): void {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    path: "/",
    // The cookie is never read by JavaScript, so httpOnly costs nothing and
    // takes XSS-driven session theft off the table.
    httpOnly: true,
    // lax still sends the cookie on top-level navigation, so opening the app
    // from a bookmark works, while blocking cross-site form posts.
    sameSite: "lax",
    // Only when actually served over TLS — a secure cookie on plain http
    // would be dropped, locking you out of a LAN deployment.
    secure,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Lets the frontend decide between the setup screen, the login screen and
  // the app without guessing from a 401.
  app.get("/api/auth/status", async (request) => {
    return {
      needsSetup: !(await hasAnyUser()),
      user: request.user ?? null,
    };
  });

  app.post<{ Body: { username?: string; password?: string } }>(
    "/api/auth/setup",
    async (request, reply) => {
      // Closes permanently the moment an account exists, so this can't be
      // used to add a second admin later. Checked here as a fast path; the
      // check that actually decides is the locked one below.
      if (await hasAnyUser()) {
        reply.code(409);
        return { error: "An account already exists" };
      }

      const username = request.body.username?.trim();
      const password = request.body.password ?? "";
      if (!username) {
        reply.code(400);
        return { error: "Username is required" };
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        reply.code(400);
        return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
      }

      // Hashed outside the transaction: scrypt is the slow part, and holding
      // the lock through it would only make concurrent setups queue longer.
      const passwordHash = await hashPassword(password);

      // Check-then-insert is a race on its own — two setup requests landing
      // together both see no user and both insert, and the second admin is
      // exactly what the check exists to prevent. The usernames differ, so
      // no unique constraint catches it. A transaction-scoped advisory lock
      // serialises setups: the second waits, then sees the first's row.
      const user = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${SETUP_LOCK_KEY}::bigint)`);
        const [existing] = await tx.select({ id: users.id }).from(users).limit(1);
        if (existing) return null;
        const [created] = await tx.insert(users).values({ username, passwordHash }).returning();
        return created;
      });
      if (!user) {
        reply.code(409);
        return { error: "An account already exists" };
      }

      const sessionId = await createSession(user.id);
      setSessionCookie(reply, sessionId, request.protocol === "https");
      return { user: { id: user.id, username: user.username } };
    }
  );

  app.post<{ Body: { username?: string; password?: string } }>(
    "/api/auth/login",
    async (request, reply) => {
      const ip = request.ip;
      // Checked before the password is even looked at, so a locked-out
      // guess costs nothing and reveals nothing.
      const wait = retryAfterSeconds(ip);
      if (wait > 0) {
        reply.code(429).header("Retry-After", String(wait));
        return { error: "Too many attempts. Try again in a few minutes.", retryAfterSeconds: wait };
      }

      const username = request.body.username?.trim() ?? "";
      const password = request.body.password ?? "";

      const [user] = await db.select().from(users).where(eq(users.username, username));
      // Verify even when the user doesn't exist would be better still, but a
      // single-account app has one known username anyway; the constant
      // message is what matters here.
      const ok = user ? await verifyPassword(password, user.passwordHash) : false;

      if (!ok) {
        recordFailure(ip);
        reply.code(401);
        return { error: INVALID_CREDENTIALS };
      }

      attempts.delete(ip);
      const sessionId = await createSession(user.id);
      setSessionCookie(reply, sessionId, request.protocol === "https");
      return { user: { id: user.id, username: user.username } };
    }
  );

  app.patch<{ Body: { username?: string } }>(
    "/api/auth/account",
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return { error: "Authentication required" };
      }

      const username = request.body.username?.trim();
      if (!username) {
        reply.code(400);
        return { error: "Username is required" };
      }

      // Checked up front so a clash reads as 409 rather than surfacing the
      // raw unique-constraint violation as a 500.
      const [clash] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.username, username), ne(users.id, request.user.id)));
      if (clash) {
        reply.code(409);
        return { error: "That username is taken" };
      }

      const [updated] = await db
        .update(users)
        .set({ username })
        .where(eq(users.id, request.user.id))
        .returning();
      return { user: { id: updated.id, username: updated.username } };
    }
  );

  app.post<{ Body: { currentPassword?: string; newPassword?: string } }>(
    "/api/auth/password",
    async (request, reply) => {
      if (!request.user) {
        reply.code(401);
        return { error: "Authentication required" };
      }

      const { currentPassword = "", newPassword = "" } = request.body;
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        reply.code(400);
        return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
      }

      const [user] = await db.select().from(users).where(eq(users.id, request.user.id));
      // Requiring the current password is what stops someone who walks up to
      // an unlocked browser from locking you out of your own server.
      if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
        reply.code(403);
        return { error: "Current password is incorrect" };
      }

      await db
        .update(users)
        .set({ passwordHash: await hashPassword(newPassword) })
        .where(eq(users.id, user.id));

      // Every other session is dropped — a password change should end any
      // login you didn't make. The current one survives so you aren't kicked
      // out of the page you just used to change it.
      const current = request.cookies[SESSION_COOKIE];
      await db
        .delete(sessions)
        .where(current ? and(eq(sessions.userId, user.id), ne(sessions.id, current)) : eq(sessions.userId, user.id));

      return { ok: true };
    }
  );

  app.post("/api/auth/logout", async (request, reply) => {
    await destroySession(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });
}
