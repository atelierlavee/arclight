import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PRIVACY_UNLOCK_EVENT,
  PrivacyLockedError,
  throwIfNotOk,
  withPrivacyUnlock,
  type PrivacyUnlockRequest,
} from "./privacyLock";

function answerPrompt(unlocked: boolean) {
  const listener = (event: Event) => {
    const request = (event as CustomEvent<PrivacyUnlockRequest>).detail;
    request.handled = true;
    queueMicrotask(() => request.resolve(unlocked));
  };
  window.addEventListener(PRIVACY_UNLOCK_EVENT, listener);
  return () => window.removeEventListener(PRIVACY_UNLOCK_EVENT, listener);
}

let detach: (() => void) | null = null;
afterEach(() => {
  detach?.();
  detach = null;
});

describe("throwIfNotOk", () => {
  it("turns the server's privacy_locked refusal into PrivacyLockedError", async () => {
    const res = new Response(JSON.stringify({ code: "privacy_locked" }), { status: 403 });
    await expect(throwIfNotOk(res, "Failed")).rejects.toBeInstanceOf(PrivacyLockedError);
  });

  it("keeps any other failure as a plain error", async () => {
    const res = new Response(JSON.stringify({ error: "Nope" }), { status: 403 });
    await expect(throwIfNotOk(res, "Failed")).rejects.toThrow("Nope");
  });
});

describe("withPrivacyUnlock", () => {
  it("asks for the credential and retries once after a lock refusal", async () => {
    detach = answerPrompt(true);
    const run = vi
      .fn()
      .mockRejectedValueOnce(new PrivacyLockedError())
      .mockResolvedValueOnce("done");
    await expect(withPrivacyUnlock(run)).resolves.toBe("done");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("gives up with the lock error when the prompt is dismissed", async () => {
    detach = answerPrompt(false);
    const run = vi.fn().mockRejectedValue(new PrivacyLockedError());
    await expect(withPrivacyUnlock(run)).rejects.toBeInstanceOf(PrivacyLockedError);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not wait forever when no prompt is mounted", async () => {
    const run = vi.fn().mockRejectedValue(new PrivacyLockedError());
    await expect(withPrivacyUnlock(run)).rejects.toBeInstanceOf(PrivacyLockedError);
  });
});
