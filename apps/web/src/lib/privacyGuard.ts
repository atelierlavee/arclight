import { useQuery } from "@tanstack/react-query";
import { fetchPrivacyStatus } from "./privacyApi";
import { useOwnPasskeys } from "./profile";
import { qk } from "./queryKeys";

export type PrivacyGuardStatus = "loading" | "error" | "ready";

/**
 * Whether leaving discreet mode has to be proved, and with what.
 *
 * Either credential guards it. Registering Touch ID without ever setting a
 * password used to leave the mode switching off freely — the check asked only
 * about the password, so the passkey sat there doing nothing.
 *
 * Fails closed: until both answers are in (or when either request failed),
 * `guarded` is true. Reading "not loaded yet" as "nothing set" let discreet
 * mode switch off with no prompt during the first moments after a load, or
 * whenever the server could not be reached. `status` says which case it is,
 * so the unlock form can show a spinner or a retry instead of a dead field.
 */
export function usePrivacyGuard(): {
  hasPassword: boolean;
  hasPasskey: boolean;
  guarded: boolean;
  status: PrivacyGuardStatus;
  retry: () => void;
} {
  const privacy = useQuery({ queryKey: qk.privacy, queryFn: fetchPrivacyStatus });
  const passkeys = useOwnPasskeys();

  const status: PrivacyGuardStatus =
    privacy.isError || passkeys.isError
      ? "error"
      : privacy.data === undefined || passkeys.data === undefined
        ? "loading"
        : "ready";
  const hasPassword = privacy.data?.hasPassword ?? false;
  const hasPasskey = (passkeys.data?.length ?? 0) > 0;
  return {
    hasPassword,
    hasPasskey,
    guarded: status !== "ready" || hasPassword || hasPasskey,
    status,
    retry: () => {
      if (privacy.isError) void privacy.refetch();
      if (passkeys.isError) void passkeys.refetch();
    },
  };
}
