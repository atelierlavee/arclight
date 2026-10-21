import { createContext, useContext } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { AuthStatus } from "./authApi";
import { fetchProfiles, type CurrentProfile, type Proof } from "./profilesApi";
import { clearProfileSession } from "./profileStorage";
import { qk } from "./queryKeys";
import { fetchPasskeys, type Passkey } from "./webauthnApi";

export type ProfileContextValue = {
  /** The selected profile; null on a server without profiles. */
  profile: CurrentProfile | null;
  /** Whether this profile may manage the library. True when single-user. */
  isOwner: boolean;
  /** Leaves this profile for the "Who's watching?" picker. */
  switchProfile: () => Promise<void>;
};

/**
 * Defaults to the single-user owner, so a surface rendered outside the
 * provider (a server without profiles, a component test) keeps every control.
 */
export const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  isOwner: true,
  switchProfile: async () => {},
});

export function useProfile(): ProfileContextValue {
  return useContext(ProfileContext);
}

export function useIsOwner(): boolean {
  return useContext(ProfileContext).isOwner;
}

/**
 * Forgets everything the outgoing profile had loaded, after the server has
 * deselected it.
 *
 * In-flight requests are cancelled first so a late response cannot write the
 * old profile's data back. Every cached query goes except auth status and the
 * profile list (the picker needs both); auth status is then told there is no
 * profile, which is what swaps the app for the picker. The outgoing profile's
 * session-scoped storage (queue, scroll positions, app-open unlock) goes too.
 */
export async function leaveProfile(
  queryClient: QueryClient,
  outgoingId: number | null,
): Promise<void> {
  await queryClient.cancelQueries();
  queryClient.removeQueries({
    predicate: (query) =>
      query.queryKey[0] !== qk.authStatus[0] && query.queryKey[0] !== qk.profiles[0],
  });
  clearProfileSession(outgoingId);
  queryClient.setQueryData<AuthStatus>(qk.authStatus, (old) =>
    old ? { ...old, profile: null } : old,
  );
}

/**
 * Passkeys that count for the current profile.
 *
 * Unlocking the vault or discreet mode accepts only the current profile's
 * own passkeys, so another profile's must not make a gate or a button appear.
 * A passkey without `profileId` (a server without profiles) counts.
 */
export function ownPasskeys(list: Passkey[], profile: CurrentProfile | null): Passkey[] {
  if (!profile) return list;
  return list.filter((key) => key.profileId === undefined || key.profileId === profile.id);
}

/** The current profile's own passkeys, from the shared passkey list query. */
export function useOwnPasskeys() {
  const { profile } = useProfile();
  return useQuery({
    queryKey: qk.passkeys,
    queryFn: fetchPasskeys,
    select: (list) => ownPasskeys(list, profile),
  });
}

export type ProofPrompt = {
  /** Whether the server asks this profile for anything at all. */
  needed: boolean;
  /** What to ask for: the account password, or the profile PIN. */
  label: string;
  numeric: boolean;
  /** The proof to send for what was typed. */
  toProof: (value: string) => Proof | null;
};

/**
 * What a sensitive change (privacy password, vault PIN, a new passkey) asks
 * this profile to prove: the owner gives the account password; any other
 * profile its own PIN, or nothing when it has none.
 */
export function useProofPrompt(): ProofPrompt {
  const { profile, isOwner } = useProfile();
  const profiles = useQuery({
    queryKey: qk.profiles,
    queryFn: fetchProfiles,
    enabled: !isOwner && profile?.hasPin === undefined,
  });
  if (isOwner) {
    return {
      needed: true,
      label: "Your account password",
      numeric: false,
      toProof: (value) => ({ accountPassword: value }),
    };
  }
  const hasPin =
    profile?.hasPin ?? profiles.data?.find((entry) => entry.id === profile?.id)?.hasPin ?? false;
  if (hasPin) {
    return {
      needed: true,
      label: "Your profile PIN",
      numeric: true,
      toProof: (value) => ({ profilePin: value }),
    };
  }
  return { needed: false, label: "", numeric: false, toProof: () => null };
}
