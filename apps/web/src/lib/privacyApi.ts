import { proofBody, type Proof } from "./profilesApi";
export async function fetchPrivacyStatus(): Promise<{ hasPassword: boolean }> {
  const res = await fetch("/api/privacy");
  if (!res.ok) throw new Error(`Failed to load privacy status: ${res.status}`);
  return res.json();
}

/** Empty `password` clears it, so discreet mode unlocks freely again. */
export async function savePrivacyPassword(
  password: string,
  proof: string | Proof | null
): Promise<void> {
  const res = await fetch("/api/privacy/password", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, ...proofBody(proof) }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to save: ${res.status}`);
  }
}

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: "wrong"; attemptsLeft?: number }
  | { ok: false; reason: "throttled"; retryAfterSeconds: number };

/** A wrong password is a result, not an exception — only transport errors throw. */
export async function unlockPrivacy(password: string): Promise<UnlockResult> {
  const res = await fetch("/api/privacy/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (res.ok) return { ok: true };

  const body = (await res.json().catch(() => null)) as
    | { attemptsLeft?: number; retryAfterSeconds?: number }
    | null;
  if (res.status === 429) {
    return { ok: false, reason: "throttled", retryAfterSeconds: body?.retryAfterSeconds ?? 60 };
  }
  if (res.status === 403) return { ok: false, reason: "wrong", attemptsLeft: body?.attemptsLeft };
  throw new Error(`Failed to unlock: ${res.status}`);
}
