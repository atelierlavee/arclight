import { randomBytes } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db } from "../db/client.js";
import { profiles, sessions, users } from "../db/schema.js";
import type { SessionProfile } from "./profileContext.js";

export const SESSION_COOKIE = "media_session";

const SESSION_DAYS = 30;
export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;

// Sliding expiry: only rewrite the row once a session is more than a day old,
// so ordinary browsing doesn't issue an UPDATE on every single request.
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function expiryFromNow(): Date {
  return new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
}

/**
 * A new session, already on `profileId` when one is given — signing in with
 * a single PIN-less profile skips the picker (see `autoSelectProfile`).
 */
export async function createSession(userId: number, profileId: number | null = null): Promise<string> {
  const id = randomBytes(32).toString("hex");
  await db.insert(sessions).values({ id, userId, profileId, expiresAt: expiryFromNow() });
  return id;
}

/**
 * The profile a fresh sign-in should land on without asking: the account's
 * only profile, when it has no PIN. With more than one there is a choice to
 * make, and with a PIN there is something to prove, so both go to the picker.
 */
export async function autoSelectProfile(userId: number): Promise<number | null> {
  const rows = await db
    .select({ id: profiles.id, pinHash: profiles.pinHash })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(2);
  return rows.length === 1 && rows[0].pinHash === null ? rows[0].id : null;
}

/** Points a session at a profile, or back at the picker with null. */
export async function setSessionProfile(sessionId: string, profileId: number | null): Promise<void> {
  await db.update(sessions).set({ profileId }).where(eq(sessions.id, sessionId));
}

export type SessionUser = {
  id: number;
  username: string;
  /** The session's own id — what the unlock throttle counts attempts against. */
  sessionId: string;
  /** Who is watching on this session, or null until one is picked. */
  profile: SessionProfile | null;
};

/**
 * Resolves a cookie value to its user, or null. Expired rows are deleted on
 * sight rather than swept by a scheduled job — the only thing that reads a
 * session is this function, so lazily is soon enough.
 */
export async function resolveSession(sessionId: string | undefined): Promise<SessionUser | null> {
  if (!sessionId) return null;

  const [row] = await db
    .select({
      id: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      username: users.username,
      profileId: profiles.id,
      profileName: profiles.name,
      profileIsOwner: profiles.isOwner,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    // Joined on the user too, so a session can only ever act as one of its
    // own account's profiles whatever ends up in the column.
    .leftJoin(profiles, and(eq(profiles.id, sessions.profileId), eq(profiles.userId, sessions.userId)))
    .where(eq(sessions.id, sessionId));

  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.id));
    return null;
  }

  if (row.expiresAt.getTime() - Date.now() < SESSION_MAX_AGE_SECONDS * 1000 - REFRESH_THRESHOLD_MS) {
    await db.update(sessions).set({ expiresAt: expiryFromNow() }).where(eq(sessions.id, row.id));
  }

  const profile =
    row.profileId === null
      ? null
      : { id: row.profileId, name: row.profileName ?? "", isOwner: row.profileIsOwner === true };
  return { id: row.userId, username: row.username, sessionId: row.id, profile };
}

export async function destroySession(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Housekeeping on boot, so dead rows don't accumulate forever. */
export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export async function hasAnyUser(): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).limit(1);
  return row !== undefined;
}
