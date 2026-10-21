import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { appSettings, mediaItemTypes, mediaItems, users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import {
  VAULT_KEY,
  getVaultPinHash,
  isVaultUnlocked,
  lockVault,
  unlockVault,
} from "../auth/vaultUnlock.js";
import { logActivity } from "../activity/log.js";
import { sweeper } from "../auth/sweep.js";

const PIN_PATTERN = /^\d{4,12}$/;
const PAGE_SIZE = 60;

/**
 * Wrong-PIN attempts, per session and across all of them.
 *
 * This used to be one global counter: five wrong PINs anywhere locked the
 * vault for a minute for everyone. That was the worst of both — any session
 * could keep the owner locked out indefinitely, and a minute per five
 * guesses still let a 4-digit PIN be walked end to end in about a week.
 *
 * Now each session gets its own budget, so one session's guessing does not
 * lock anyone else out, and the lockout doubles with every further failure
 * (1 min, 2, 4, ... capped at a day), so the run of guesses past the free
 * five costs exponentially more. A fresh session does not reset anything
 * useful to an attacker: making one takes the account password or a
 * passkey, and either of those can already reset the PIN or open the vault.
 *
 * The global counter stays as a backstop with a much larger allowance, for
 * guesses spread over many sessions. The owner always has a way past it —
 * passkey unlock, or resetting the PIN with the account password, which
 * clears every counter.
 */
const MAX_ATTEMPTS = 5;
const MAX_GLOBAL_ATTEMPTS = 25;
const BASE_LOCKOUT_MS = 60_000;
const MAX_LOCKOUT_MS = 24 * 60 * 60 * 1000;
// A session's counter is forgotten once it has been quiet this long and is
// not mid-lockout — long enough that waiting it out is no shortcut.
const FORGET_AFTER_MS = 24 * 60 * 60 * 1000;

type AttemptRecord = { count: number; blockedUntil: number; lastAt: number };
const sessionAttempts = new Map<string, AttemptRecord>();
const globalAttempts: AttemptRecord = { count: 0, blockedUntil: 0, lastAt: 0 };
const sweepAttempts = sweeper(
  sessionAttempts,
  (record, now) => record.blockedUntil <= now && now - record.lastAt > FORGET_AFTER_MS,
);

/** How long the lockout runs after the `count`th consecutive failure. */
export function lockoutMs(count: number, allowance: number): number {
  if (count < allowance) return 0;
  // Bounded exponent: 2^30 minutes is already far past the cap.
  const doublings = Math.min(count - allowance, 30);
  return Math.min(BASE_LOCKOUT_MS * 2 ** doublings, MAX_LOCKOUT_MS);
}

function fail(record: AttemptRecord, allowance: number, now: number): void {
  record.count += 1;
  record.lastAt = now;
  const wait = lockoutMs(record.count, allowance);
  if (wait > 0) record.blockedUntil = now + wait;
}

/** Test hook: the counters are process-wide, so suites reset them between cases. */
export function resetVaultAttempts(): void {
  sessionAttempts.clear();
  globalAttempts.count = 0;
  globalAttempts.blockedUntil = 0;
  globalAttempts.lastAt = 0;
}

const hiddenNow = () =>
  and(
    isNotNull(mediaItems.hiddenAt),
    eq(mediaItems.inScope, true),
    sql`${mediaItems.missingSince} is null`,
  );

export async function vaultRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/vault", async (request) => {
    const hasPin = (await getVaultPinHash()) !== null;
    const unlocked = hasPin && isVaultUnlocked(request.user?.sessionId);
    let count: number | null = null;
    if (unlocked) {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(mediaItems)
        .where(hiddenNow());
      count = row?.n ?? 0;
    }
    return { hasPin, unlocked, count };
  });

  /** Sets, replaces, or (with an empty pin) removes the PIN. */
  app.put<{ Body: { pin?: string; accountPassword?: string } }>(
    "/api/vault/pin",
    async (request, reply) => {
      const userId = request.user?.id;
      if (userId === undefined) {
        reply.code(401);
        return { error: "Not signed in" };
      }
      const { pin, accountPassword } = request.body ?? {};

      const [account] = await db.select().from(users).where(eq(users.id, userId));
      if (!account || !(await verifyPassword(accountPassword ?? "", account.passwordHash))) {
        reply.code(403);
        return { error: "That account password isn't right" };
      }

      if (!pin) {
        await db.delete(appSettings).where(eq(appSettings.key, VAULT_KEY));
        lockVault(request.user!.sessionId);
        await logActivity("vault", "Vault PIN removed");
        return { hasPin: false };
      }
      if (!PIN_PATTERN.test(pin)) {
        reply.code(400);
        return { error: "Use 4 to 12 digits" };
      }

      const value = { pinHash: await hashPassword(pin) };
      await db
        .insert(appSettings)
        .values({ key: VAULT_KEY, value })
        .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
      unlockVault(request.user!.sessionId);
      resetVaultAttempts();
      await logActivity("vault", "Vault PIN changed");
      return { hasPin: true };
    },
  );

  app.post<{ Body: { pin?: string } }>("/api/vault/unlock", async (request, reply) => {
    if (!request.user) {
      reply.code(401);
      return { error: "Not signed in" };
    }

    sweepAttempts();
    const sessionId = request.user.sessionId;
    const now = Date.now();
    const record = sessionAttempts.get(sessionId) ?? { count: 0, blockedUntil: 0, lastAt: now };
    const blockedUntil = Math.max(record.blockedUntil, globalAttempts.blockedUntil);
    if (blockedUntil > now) {
      reply.code(429);
      return {
        ok: false,
        error: "Too many attempts",
        retryAfterSeconds: Math.ceil((blockedUntil - now) / 1000),
      };
    }

    const stored = await getVaultPinHash();
    if (stored === null) {
      reply.code(400);
      return { ok: false, error: "Set a PIN first" };
    }

    if (!(await verifyPassword(request.body?.pin ?? "", stored))) {
      // The count keeps rising past the limit rather than resetting when a
      // lockout ends, so each further wrong guess doubles the next wait
      // instead of buying a fresh batch of free tries.
      fail(record, MAX_ATTEMPTS, now);
      sessionAttempts.set(sessionId, record);
      fail(globalAttempts, MAX_GLOBAL_ATTEMPTS, now);
      reply.code(403);
      return {
        ok: false,
        error: "Wrong PIN",
        attemptsLeft: Math.max(0, MAX_ATTEMPTS - record.count),
      };
    }

    // A right PIN proves the owner is here, so the slate is wiped for every
    // session — including whatever was guessing alongside.
    resetVaultAttempts();
    unlockVault(request.user.sessionId);
    return { ok: true };
  });

  app.post("/api/vault/lock", async (request) => {
    if (request.user) lockVault(request.user.sessionId);
    return { ok: true };
  });

  app.get<{ Querystring: { page?: string } }>("/api/vault/items", async (request, reply) => {
    if (!isVaultUnlocked(request.user?.sessionId)) {
      reply.code(403);
      return { error: "The vault is locked" };
    }
    const page = Math.max(1, Number(request.query.page ?? 1) || 1);

    const rows = await db
      .select({
        id: mediaItems.id,
        title: mediaItems.title,
        itemType: mediaItemTypes.name,
        thumbnailFile: mediaItems.thumbnailFile,
        thumbnailPositionX: mediaItems.thumbnailPositionX,
        thumbnailPositionY: mediaItems.thumbnailPositionY,
        thumbnailScale: mediaItems.thumbnailScale,
        durationSeconds: mediaItems.durationSeconds,
        hiddenAt: mediaItems.hiddenAt,
      })
      .from(mediaItems)
      .innerJoin(mediaItemTypes, eq(mediaItemTypes.id, mediaItems.itemTypeId))
      .where(hiddenNow())
      .orderBy(desc(mediaItems.hiddenAt), desc(mediaItems.id))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE);

    return {
      items: rows.slice(0, PAGE_SIZE),
      page,
      pageSize: PAGE_SIZE,
      hasMore: rows.length > PAGE_SIZE,
    };
  });
}
