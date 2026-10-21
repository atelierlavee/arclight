/**
 * Thrown when the server says this session has not proved the privacy
 * credential. Its own class so callers can offer the unlock instead of
 * showing "something went wrong" for a state with an obvious remedy.
 *
 * The server enforces the lock whatever the UI believes, so this also covers
 * the unlock quietly expiring while a page sits open.
 */
export class PrivacyLockedError extends Error {
  constructor() {
    super("Locked — this needs your privacy password or passkey.");
    this.name = "PrivacyLockedError";
  }
}

/** Whether a failed response is the server's `privacy_locked` refusal. */
export async function isPrivacyLockedResponse(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  const body = (await res
    .clone()
    .json()
    .catch(() => null)) as { code?: string } | null;
  return body?.code === "privacy_locked";
}

/** Throws PrivacyLockedError for a lock refusal, or `fallback` for anything else. */
export async function throwIfNotOk(res: Response, fallback: string): Promise<void> {
  if (res.ok) return;
  if (await isPrivacyLockedResponse(res)) throw new PrivacyLockedError();
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? `${fallback}: ${res.status}`);
}

export const PRIVACY_UNLOCK_EVENT = "media-server:privacy-unlock";

export type PrivacyUnlockRequest = {
  resolve: (unlocked: boolean) => void;
  /** Set by the prompt, so a request with nobody listening fails fast. */
  handled?: boolean;
};

/**
 * Asks the app-wide prompt (PrivacyUnlockPrompt, in the layout) for the
 * privacy credential. Resolves true once it is proved, false if dismissed.
 */
export function requestPrivacyUnlock(): Promise<boolean> {
  return new Promise((resolve) => {
    const detail: PrivacyUnlockRequest = { resolve };
    window.dispatchEvent(new CustomEvent(PRIVACY_UNLOCK_EVENT, { detail }));
    if (!detail.handled) resolve(false);
  });
}

/**
 * Runs a guarded action, and on a lock refusal asks for the credential and
 * runs it once more.
 *
 * One retry, not a loop: if the second attempt is refused too, something
 * other than an expired unlock is wrong, and asking again would only trap
 * the person in a prompt. A dismissed prompt surfaces as the original
 * PrivacyLockedError, so callers that already handle it keep working.
 */
export async function withPrivacyUnlock<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof PrivacyLockedError)) throw error;
    if (!(await requestPrivacyUnlock())) throw error;
    return run();
  }
}
