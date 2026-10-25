import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/client.js";
import { profiles } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { serialized } from "../auth/serialize.js";
import { lockPrivacySession } from "../auth/privacyUnlock.js";
import { accountPasswordOk } from "../auth/profileProof.js";
import { setSessionProfile } from "../auth/sessions.js";
import { sweeper } from "../auth/sweep.js";
import { lockVaultSession } from "../auth/vaultUnlock.js";
import { parseId } from "./mediaItemQueries.js";
import { setPrivacyPassword } from "./privacy.js";
import { lockoutMs, setVaultPin } from "./vault.js";

/**
 * Netflix-style profiles: who is watching, under one sign-in.
 *
 * The account (users) is what gets you through the door; a profile is whose
 * history, favourites, vault and settings you then see. Everything here is
 * scoped to the signed-in account, so a profile id from another account is
 * simply "not found".
 *
 * Who may do what is split between the guard and these handlers: creating
 * and deleting profiles is in auth/ownerRoutes.ts; renaming, recolouring and
 * PINs depend on *which* profile is being changed, so they are decided here.
 */

const PIN_PATTERN = /^\d{4,8}$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const MAX_NAME_LENGTH = 40;
const MAX_PROFILES = 20;
const DEFAULT_COLOR = "#6366f1";

/**
 * Wrong-PIN attempts at the picker, per session.
 *
 * Per session rather than per profile so cycling through profiles buys no
 * extra guesses. Same escalating lockout as the vault (1 min, doubling,
 * capped at a day) after five free tries: a 4-digit PIN is only 10,000
 * guesses, so the free ones have to stay few. In memory for the reasons the
 * other throttles are — single instance, and a restart costs an attacker
 * the account password or a passkey to get a session again anyway.
 */
const MAX_ATTEMPTS = 5;
const FORGET_AFTER_MS = 24 * 60 * 60 * 1000;
type AttemptRecord = { count: number; blockedUntil: number; lastAt: number };
const attempts = new Map<string, AttemptRecord>();
// Across every session. Logging in again gives a fresh session and so a fresh
// per-session budget; this is what stops that from being a way round the
// limit.
const MAX_GLOBAL_ATTEMPTS = 25;
const globalPinAttempts: AttemptRecord = { count: 0, blockedUntil: 0, lastAt: 0 };
const sweepAttempts = sweeper(
  attempts,
  (record, now) => record.blockedUntil <= now && now - record.lastAt > FORGET_AFTER_MS,
);

/** Test hook: the counters are process-wide, so suites reset them between cases. */
export function resetProfilePinAttempts(): void {
  attempts.clear();
  Object.assign(globalPinAttempts, { count: 0, blockedUntil: 0, lastAt: 0 });
}

type ProfileRow = typeof profiles.$inferSelect;

/** The public shape — never the PIN hash, only whether there is one. */
function present(row: ProfileRow) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isOwner: row.isOwner,
    hasPin: row.pinHash !== null,
    position: row.position,
  };
}

/** One of the signed-in account's profiles, or null (answered as 404). */
async function ownProfile(request: FastifyRequest, rawId: unknown): Promise<ProfileRow | null> {
  const id = parseId(rawId);
  const userId = request.user?.id;
  if (id === null || userId === undefined) return null;
  const [row] = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, id), eq(profiles.userId, userId)));
  return row ?? null;
}

/**
 * Checks a PIN against the throttle. Returns true when it is right; when it
 * is not (or the session is locked out) the reply is already sent.
 */
async function checkPin(
  request: FastifyRequest,
  reply: FastifyReply,
  pinHash: string,
  pin: unknown,
): Promise<boolean> {
  // One attempt at a time: the throttle is read, a slow hash is verified,
  // then the failure is recorded, and parallel requests would all read the
  // counter before the first failure landed.
  return serialized("profile-pin", async () => {
    sweepAttempts();
    const sessionId = request.user!.sessionId;
    const now = Date.now();
    const record = attempts.get(sessionId) ?? { count: 0, blockedUntil: 0, lastAt: now };
    const blockedUntil = Math.max(record.blockedUntil, globalPinAttempts.blockedUntil);
    if (blockedUntil > now) {
      reply.code(429).send({
        error: "Too many attempts",
        code: "pin_locked",
        retryAfterSeconds: Math.ceil((blockedUntil - now) / 1000),
      });
      return false;
    }
    if (typeof pin === "string" && (await verifyPassword(pin, pinHash))) {
      attempts.delete(sessionId);
      return true;
    }
    for (const [target, allowance] of [
      [record, MAX_ATTEMPTS],
      [globalPinAttempts, MAX_GLOBAL_ATTEMPTS],
    ] as const) {
      target.count += 1;
      target.lastAt = now;
      const wait = lockoutMs(target.count, allowance);
      if (wait > 0) target.blockedUntil = now + wait;
    }
    attempts.set(sessionId, record);
    reply.code(403).send({
      error: "Wrong PIN",
      code: "bad_pin",
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - record.count),
    });
    return false;
  });
}

/** Validates a name; returns the trimmed name or an error message. */
function cleanName(raw: unknown): { name: string } | { error: string } {
  if (typeof raw !== "string" || !raw.trim()) return { error: "name is required" };
  const name = raw.trim();
  if (name.length > MAX_NAME_LENGTH) return { error: `name must be at most ${MAX_NAME_LENGTH} characters` };
  return { name };
}

async function nameTaken(userId: number, name: string, exceptId?: number): Promise<boolean> {
  const [clash] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        eq(profiles.userId, userId),
        sql`lower(${profiles.name}) = lower(${name})`,
        exceptId === undefined ? undefined : ne(profiles.id, exceptId),
      ),
    );
  return clash !== undefined;
}

/**
 * A switch drops every privacy and vault unlock the session held, whichever
 * profile they were for: proving yourself as one person must not carry over
 * to the next one at the keyboard.
 */
function clearUnlocks(sessionId: string): void {
  lockPrivacySession(sessionId);
  lockVaultSession(sessionId);
}

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  // Reachable without a profile picked: this is what the picker draws.
  app.get("/api/profiles", async (request) => {
    const rows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, request.user!.id))
      .orderBy(asc(profiles.position), asc(profiles.id));
    return { profiles: rows.map(present) };
  });

  app.post<{ Params: { id: string }; Body: { pin?: unknown } | undefined }>(
    "/api/profiles/:id/select",
    async (request, reply) => serialized(`profile-select:${request.user!.sessionId}`, async () => {
      const row = await ownProfile(request, request.params.id);
      if (!row) {
        reply.code(404);
        return { error: "Not found" };
      }
      if (row.pinHash !== null && !(await checkPin(request, reply, row.pinHash, request.body?.pin))) {
        return reply;
      }
      const sessionId = request.user!.sessionId;
      clearUnlocks(sessionId);
      await setSessionProfile(sessionId, row.id);
      return { profile: present(row) };
    }),
  );

  app.post("/api/profiles/deselect", async (request) => {
    const sessionId = request.user!.sessionId;
    clearUnlocks(sessionId);
    await setSessionProfile(sessionId, null);
    return { ok: true };
  });

  // Owner only (auth/ownerRoutes.ts).
  app.post<{ Body: { name?: unknown; color?: unknown } | undefined }>(
    "/api/profiles",
    async (request, reply) => serialized("profiles-create", async () => {
      const userId = request.user!.id;
      const named = cleanName(request.body?.name);
      if ("error" in named) {
        reply.code(400);
        return { error: named.error };
      }
      const color = request.body?.color ?? DEFAULT_COLOR;
      if (typeof color !== "string" || !COLOR_PATTERN.test(color)) {
        reply.code(400);
        return { error: "color must be a #rrggbb hex colour" };
      }
      if (await nameTaken(userId, named.name)) {
        reply.code(409);
        return { error: "A profile with that name already exists" };
      }
      const [{ total, maxPosition }] = await db
        .select({
          total: sql<number>`count(*)::int`,
          maxPosition: sql<number>`coalesce(max(${profiles.position}), 0)::int`,
        })
        .from(profiles)
        .where(eq(profiles.userId, userId));
      if (total >= MAX_PROFILES) {
        reply.code(400);
        return { error: `At most ${MAX_PROFILES} profiles` };
      }
      const [created] = await db
        .insert(profiles)
        .values({ userId, name: named.name, color, position: maxPosition + 1 })
        .returning();
      reply.code(201);
      return { profile: present(created) };
    }),
  );

  /**
   * Rename / recolour / reorder. Your own profile, or — for the owner —
   * anyone's. Not in OWNER_ONLY_ROUTES because "self" is decided per row.
   */
  app.patch<{ Params: { id: string }; Body: { name?: unknown; color?: unknown; position?: unknown } | undefined }>(
    "/api/profiles/:id",
    async (request, reply) => {
      const row = await ownProfile(request, request.params.id);
      if (!row) {
        reply.code(404);
        return { error: "Not found" };
      }
      const self = row.id === request.profile?.id;
      if (!self && !request.profile?.isOwner) {
        reply.code(403);
        return { error: "Only the owner profile can change other profiles", code: "owner_only" };
      }
      const body = request.body ?? {};
      const patch: Partial<typeof profiles.$inferInsert> = {};
      if (body.name !== undefined) {
        const named = cleanName(body.name);
        if ("error" in named) {
          reply.code(400);
          return { error: named.error };
        }
        if (await nameTaken(row.userId, named.name, row.id)) {
          reply.code(409);
          return { error: "A profile with that name already exists" };
        }
        patch.name = named.name;
      }
      if (body.color !== undefined) {
        if (typeof body.color !== "string" || !COLOR_PATTERN.test(body.color)) {
          reply.code(400);
          return { error: "color must be a #rrggbb hex colour" };
        }
        patch.color = body.color;
      }
      if (body.position !== undefined) {
        // The order of the picker is the household's, so the owner's call.
        if (!request.profile?.isOwner) {
          reply.code(403);
          return { error: "Only the owner profile can reorder profiles", code: "owner_only" };
        }
        if (typeof body.position !== "number" || !Number.isInteger(body.position) || body.position < 0 || body.position > 1000) {
          reply.code(400);
          return { error: "position must be a whole number from 0 to 1000" };
        }
        patch.position = body.position;
      }
      if (Object.keys(patch).length === 0) {
        reply.code(400);
        return { error: "Nothing to update" };
      }
      const [updated] = await db.update(profiles).set(patch).where(eq(profiles.id, row.id)).returning();
      return { profile: present(updated) };
    },
  );

  /**
   * Deletes a profile and, by cascade, everything that was theirs: history,
   * favourites, ratings, bookmarks, vault, settings, passkeys. Owner only
   * (ownerRoutes.ts); the owner profile itself cannot go — the library would
   * be left with nobody to manage it.
   */
  app.delete<{ Params: { id: string } }>("/api/profiles/:id", async (request, reply) => {
    const row = await ownProfile(request, request.params.id);
    if (!row) {
      reply.code(404);
      return { error: "Not found" };
    }
    if (row.isOwner) {
      reply.code(400);
      return { error: "The owner profile cannot be deleted" };
    }
    await db.delete(profiles).where(eq(profiles.id, row.id));
    return { ok: true };
  });

  /**
   * Sets, changes or (newPin: null) clears a profile PIN.
   *
   * Your own: give the current PIN when there is one — the account password
   * is not asked for, so a housemate never needs the owner's. Someone
   * else's: owner only, proving the account password, and no current PIN —
   * that is the "forgot my PIN" reset.
   */
  app.put<{
    Params: { id: string };
    Body: { newPin?: unknown; currentPin?: unknown; accountPassword?: unknown } | undefined;
  }>("/api/profiles/:id/pin", async (request, reply) => {
    const row = await ownProfile(request, request.params.id);
    if (!row) {
      reply.code(404);
      return { error: "Not found" };
    }
    const body = request.body ?? {};
    const newPin = body.newPin;
    if (newPin !== null && (typeof newPin !== "string" || !PIN_PATTERN.test(newPin))) {
      reply.code(400);
      return { error: "newPin must be 4 to 8 digits, or null to remove it" };
    }

    const self = row.id === request.profile?.id;
    if (self) {
      if (row.pinHash !== null && !(await checkPin(request, reply, row.pinHash, body.currentPin))) {
        return reply;
      }
    } else {
      if (!request.profile?.isOwner) {
        reply.code(403);
        return { error: "Only the owner profile can reset another profile's PIN", code: "owner_only" };
      }
      if (!(await accountPasswordOk(request.user!.id, body.accountPassword))) {
        reply.code(403);
        return { error: "That account password isn't right", code: "account_password_required" };
      }
    }

    const pinHash = newPin === null ? null : await hashPassword(newPin);
    await db.update(profiles).set({ pinHash }).where(eq(profiles.id, row.id));
    return { hasPin: pinHash !== null };
  });

  /**
   * The owner's way out for a housemate who forgot their vault PIN or
   * privacy password: clears either (or both) for that profile, proving the
   * account password. Clearing rather than setting, so the owner never
   * learns the new secret — the profile sets its own afterwards.
   */
  app.post<{
    Params: { id: string };
    Body: { accountPassword?: unknown; vaultPin?: unknown; privacyPassword?: unknown } | undefined;
  }>("/api/profiles/:id/reset-secrets", async (request, reply) => {
    const row = await ownProfile(request, request.params.id);
    if (!row) {
      reply.code(404);
      return { error: "Not found" };
    }
    const body = request.body ?? {};
    if (body.vaultPin !== true && body.privacyPassword !== true) {
      reply.code(400);
      return { error: "Say which to reset: vaultPin and/or privacyPassword" };
    }
    if (!(await accountPasswordOk(request.user!.id, body.accountPassword))) {
      reply.code(403);
      return { error: "That account password isn't right", code: "account_password_required" };
    }
    if (body.vaultPin === true) await setVaultPin(row.id, null);
    if (body.privacyPassword === true) await setPrivacyPassword(row.id, null);
    return { ok: true };
  });
}
