import type { FastifyRequest } from "fastify";

/** The profile a session is acting as — see sessions.profile_id. */
export type SessionProfile = { id: number; name: string; isOwner: boolean };

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Who is watching. Null when signed in but no profile is picked yet, in
     * which case the guard has already answered everything outside its small
     * allow-list with 409 profile_required — so a handler past the guard can
     * rely on it via `profileId(request)`.
     */
    profile: SessionProfile | null;
  }
}

/**
 * The current profile's id, for handlers behind the guard.
 *
 * Throws rather than returning a sentinel: reaching a per-profile handler
 * without a profile means the guard's allow-list is wrong, and a query run
 * against "profile 0" would quietly answer as if nobody had any history.
 */
export function profileId(request: FastifyRequest): number {
  const id = request.profile?.id;
  if (id === undefined) throw new Error("No profile selected for this request");
  return id;
}

/**
 * The key the per-session unlock maps (privacy, vault) use.
 *
 * Session plus profile, so unlocking one profile's vault never opens another
 * profile's on the same browser. Null when there is no session or profile,
 * which every caller treats as "locked".
 */
export function unlockKey(request: FastifyRequest): string | null {
  const sessionId = request.user?.sessionId;
  const id = request.profile?.id;
  if (!sessionId || id === undefined) return null;
  return `${sessionId}:${id}`;
}

/** Drops every entry for a session from an unlock map, whichever profile. */
export function forgetSession<V>(map: Map<string, V>, sessionId: string): void {
  const prefix = `${sessionId}:`;
  for (const key of map.keys()) if (key.startsWith(prefix)) map.delete(key);
}
