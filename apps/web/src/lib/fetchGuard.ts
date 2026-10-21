import type { QueryClient } from "@tanstack/react-query";
import type { AuthStatus } from "./authApi";
import { leaveProfile } from "./profile";
import { qk } from "./queryKeys";

/** Fired when the server refuses a request because this profile isn't the owner. */
export const OWNER_ONLY_EVENT = "media-server:owner-only";

function isApi(input: RequestInfo | URL): boolean {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    return new URL(url, window.location.href).pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

/** Only actions get the toast; a background read refused is not news. */
function isWrite(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  return method.toUpperCase() !== "GET";
}

/**
 * Watches every /api response for the two profile refusals.
 *
 * There is no shared fetch wrapper — calls are spread across many modules —
 * so this wraps `window.fetch` once. Only /api 409s and 403s are looked at,
 * through a clone, so the caller still reads its own body untouched:
 *
 * - 409 `profile_required`: the session has no profile (switched in another
 *   tab, or the server forgot it). The old profile's cache is dropped and
 *   auth status told so, which shows the "Who's watching?" picker.
 * - 403 `owner_only`: a management action from a non-owner profile slipped
 *   through the hidden UI. Announced as an event for a toast — for writes
 *   only, so a background read the server refuses doesn't nag.
 *
 * Returns an uninstall function (for tests).
 */
export function installFetchGuard(queryClient: QueryClient): () => void {
  const original = window.fetch;
  const guarded: typeof window.fetch = async (input, init) => {
    const res = await original(input, init);
    if ((res.status === 409 || res.status === 403) && isApi(input)) {
      void res
        .clone()
        .json()
        .then((body: { code?: string } | null) => {
          if (res.status === 409 && body?.code === "profile_required") {
            const current = queryClient.getQueryData<AuthStatus>(qk.authStatus)?.profile;
            if (current) void leaveProfile(queryClient, current.id);
          } else if (res.status === 403 && body?.code === "owner_only" && isWrite(input, init)) {
            window.dispatchEvent(new Event(OWNER_ONLY_EVENT));
          }
        })
        .catch(() => {});
    }
    return res;
  };
  window.fetch = guarded;
  return () => {
    if (window.fetch === guarded) window.fetch = original;
  };
}
