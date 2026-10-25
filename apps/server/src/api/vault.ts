import { parsePage } from "./mediaItemQueries.js";
import { serialized } from "../auth/serialize.js";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { mediaItemTypes, mediaItems, profileItemState } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { profileId, unlockKey } from "../auth/profileContext.js";
import { proveProfile } from "../auth/profileProof.js";
import {
  VAULT_KEY,
  getVaultPinHash,
  isVaultUnlocked,
  lockVault,
  unlockVault,
} from "../auth/vaultUnlock.js";
import { deleteProfileSetting, setProfileSetting } from "../library/profileSettings.js";
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

/** Sets (or with null, removes) one profile's vault PIN. */
export async function setVaultPin(profile: number, pin: string | null): Promise<void> {
  if (pin === null) await deleteProfileSetting(profile, VAULT_KEY);
  else await setProfileSetting(profile, VAULT_KEY, { pinHash: await hashPassword(pin) });
}

/**
 * This profile's vault: its own profile_item_state rows with hidden_at set.
 * Used with an inner join on profile_item_state for `profile`.
 */
const hiddenNow = (profile: number) =>
  and(
    eq(profileItemState.profileId, profile),
    isNotNull(profileItemState.hiddenAt),
    eq(mediaItems.inScope, true),
    sql`${mediaItems.missingSince} is null`,
  );

export async function vaultRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/vault", async (request) => {
    const profile = profileId(request);
    const hasPin = (await getVaultPinHash(profile)) !== null;
    const unlocked = hasPin && isVaultUnlocked(unlockKey(request));
    let count: number | null = null;
    if (unlocked) {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(profileItemState)
        .innerJoin(mediaItems, eq(mediaItems.id, profileItemState.mediaItemId))
        .where(hiddenNow(profile));
      count = row?.n ?? 0;
    }
    return { hasPin, unlocked, count };
  });

  /** Sets, replaces, or (with an empty pin) removes the PIN. */
  // Proof: the account password for the owner profile, the profile's own
  // PIN for anyone else (see auth/profileProof.ts).
  app.put<{ Body: { pin?: string; accountPassword?: string; profilePin?: string } }>(
    "/api/vault/pin",
    async (request, reply) => {
      const { pin } = request.body ?? {};
      const profile = profileId(request);
      const key = unlockKey(request)!;

      const failure = await proveProfile(request, request.body ?? {});
      if (failure) {
        reply.code(403);
        return failure;
      }

      // Only the owner's changes reach the activity log: it is library-wide
      // and the owner reads it, so another profile's vault is not its story.
      const log = request.profile?.isOwner ? logActivity : async () => {};

      if (!pin) {
        await setVaultPin(profile, null);
        lockVault(key);
        await log("vault", "Vault PIN removed");
        return { hasPin: false };
      }
      if (!PIN_PATTERN.test(pin)) {
        reply.code(400);
        return { error: "Use 4 to 12 digits" };
      }

      await setVaultPin(profile, pin);
      unlockVault(key);
      resetVaultAttempts();
      await log("vault", "Vault PIN changed");
      return { hasPin: true };
    },
  );

  app.post<{ Body: { pin?: string } }>("/api/vault/unlock", async (request, reply) => serialized("vault", async () => {
    if (!request.user) {
      reply.code(401);
      return { error: "Not signed in" };
    }

    sweepAttempts();
    const sessionId = unlockKey(request)!;
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

    const stored = await getVaultPinHash(profileId(request));
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

    // A right PIN clears this session+profile's own slate. Not everyone's:
    // with profiles, knowing your own PIN proves nothing about anyone
    // else's vault, so it must not buy fresh guesses at theirs.
    sessionAttempts.delete(sessionId);
    unlockVault(sessionId);
    return { ok: true };
  }));

  app.post("/api/vault/lock", async (request) => {
    const key = unlockKey(request);
    if (key) lockVault(key);
    return { ok: true };
  });

  app.get<{ Querystring: { page?: string } }>("/api/vault/items", async (request, reply) => {
    if (!isVaultUnlocked(unlockKey(request))) {
      reply.code(403);
      return { error: "The vault is locked" };
    }
    const profile = profileId(request);
    const page = parsePage(request.query.page) ?? 1;

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
        hiddenAt: profileItemState.hiddenAt,
      })
      .from(profileItemState)
      .innerJoin(mediaItems, eq(mediaItems.id, profileItemState.mediaItemId))
      .innerJoin(mediaItemTypes, eq(mediaItemTypes.id, mediaItems.itemTypeId))
      .where(hiddenNow(profile))
      .orderBy(desc(profileItemState.hiddenAt), desc(mediaItems.id))
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
