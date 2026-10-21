/**
 * The profiles API: who's watching, switching, and the owner's management.
 *
 * Every call here works without a selected profile only where the server
 * allows it (listing and selecting); the rest need one like any other route.
 */

export type Profile = {
  id: number;
  name: string;
  color: string;
  isOwner: boolean;
  hasPin: boolean;
  position: number;
};

/** The profile a session has selected, as auth status reports it. */
export type CurrentProfile = {
  id: number;
  name: string;
  isOwner: boolean;
  color?: string;
  hasPin?: boolean;
};

export const DEFAULT_PROFILE_COLOR = "#6366f1";

/** The colours offered when adding or recolouring a profile. */
export const PROFILE_COLORS = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#0ea5e9",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
] as const;

export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 8;

/**
 * The proof a sensitive change asks for: the owner gives the account
 * password, any other profile its own profile PIN.
 */
export type Proof = { accountPassword: string } | { profilePin: string };

export function proofFor(isOwner: boolean, value: string): Proof {
  return isOwner ? { accountPassword: value } : { profilePin: value };
}

/**
 * The request-body fields for a proof. A bare string is the account password
 * (the single-user form); `null` is a non-owner without a PIN, which the
 * server asks nothing of.
 */
export function proofBody(proof: string | Proof | null): Partial<Proof> {
  if (proof === null) return {};
  return typeof proof === "string" ? { accountPassword: proof } : proof;
}

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error ?? `Request failed: ${res.status}`);
  return data as T;
}

export async function fetchProfiles(): Promise<Profile[]> {
  const res = await fetch("/api/profiles");
  if (!res.ok) throw new Error(`Failed to load profiles: ${res.status}`);
  const data = (await res.json()) as Profile[] | { profiles: Profile[] };
  const list = Array.isArray(data) ? data : data.profiles;
  return [...list].sort((a, b) => a.position - b.position || a.id - b.id);
}

export type SelectResult =
  | { ok: true }
  | { ok: false; reason: "bad_pin"; attemptsLeft?: number }
  | { ok: false; reason: "throttled"; retryAfterSeconds: number };

/** A wrong PIN is a result, not an exception — only other failures throw. */
export async function selectProfile(id: number, pin?: string): Promise<SelectResult> {
  const res = await fetch(`/api/profiles/${id}/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pin === undefined ? {} : { pin }),
  });
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => null)) as {
    code?: string;
    error?: string;
    attemptsLeft?: number;
    retryAfterSeconds?: number;
  } | null;
  if (res.status === 429 || body?.code === "pin_locked") {
    return { ok: false, reason: "throttled", retryAfterSeconds: body?.retryAfterSeconds ?? 60 };
  }
  if (body?.code === "bad_pin") {
    return { ok: false, reason: "bad_pin", attemptsLeft: body.attemptsLeft };
  }
  throw new Error(body?.error ?? `Failed to select profile: ${res.status}`);
}

export async function deselectProfile(): Promise<void> {
  const res = await fetch("/api/profiles/deselect", { method: "POST" });
  if (!res.ok) throw new Error(`Failed to switch profile: ${res.status}`);
}

export async function createProfile(input: { name: string; color: string }): Promise<Profile> {
  return (await send<{ profile: Profile }>("/api/profiles", "POST", input)).profile;
}

export async function updateProfile(
  id: number,
  input: { name?: string; color?: string },
): Promise<Profile> {
  return (await send<{ profile: Profile }>(`/api/profiles/${id}`, "PATCH", input)).profile;
}

/**
 * Clears another profile's vault PIN and/or privacy password (owner only),
 * for when that person has forgotten one. Their vault contents stay hidden;
 * they set a new PIN to open it again.
 */
export function resetProfileSecrets(
  id: number,
  input: { accountPassword: string; vaultPin?: true; privacyPassword?: true },
): Promise<void> {
  return send<void>(`/api/profiles/${id}/reset-secrets`, "POST", input);
}

export function deleteProfile(id: number): Promise<void> {
  return send<void>(`/api/profiles/${id}`, "DELETE");
}

/**
 * Sets (`newPin`) or removes (`null`) a profile's PIN.
 *
 * Your own: give `currentPin` when one is set. Someone else's (owner only):
 * give `accountPassword` instead.
 */
export function setProfilePin(
  id: number,
  input: { newPin: string | null; currentPin?: string; accountPassword?: string },
): Promise<void> {
  return send<void>(`/api/profiles/${id}/pin`, "PUT", input);
}

/** Initial for a profile tile. */
export function profileInitial(name: string): string {
  return name.trim()[0]?.toUpperCase() ?? "?";
}
