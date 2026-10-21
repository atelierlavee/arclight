import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { OWNER_ONLY_EVENT } from "@/lib/fetchGuard";
import { ProfileContext, leaveProfile, type ProfileContextValue } from "@/lib/profile";
import { deselectProfile, type CurrentProfile } from "@/lib/profilesApi";
import { migrateBareKeysToOwner, setStorageProfile } from "@/lib/profileStorage";
import { useToast } from "@/lib/toast";

/**
 * Provides the selected profile to the app.
 *
 * `profile` is undefined on a server without profiles: the app then runs as
 * it always did — single-user, as the owner, with bare storage keys.
 *
 * Storage is pointed at the profile here, during render, so the stores the
 * children read in their state initialisers already see the right keys. The
 * caller keys the subtree on the profile id, so a switch remounts all of it.
 */
export function ProfileProvider({
  profile,
  children,
}: {
  profile: CurrentProfile | undefined;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();

  setStorageProfile(profile?.id ?? null);
  if (profile?.isOwner) migrateBareKeysToOwner(profile.id);

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile: profile ?? null,
      isOwner: profile ? profile.isOwner : true,
      switchProfile: async () => {
        await deselectProfile();
        await leaveProfile(queryClient, profile?.id ?? null);
      },
    }),
    [profile, queryClient],
  );

  return (
    <ProfileContext.Provider value={value}>
      {/* Only a server with profiles ever answers owner_only. */}
      {profile && <OwnerOnlyToaster />}
      {children}
    </ProfileContext.Provider>
  );
}

/** Turns a 403 owner_only from any write into a toast (see lib/fetchGuard). */
function OwnerOnlyToaster() {
  const { toast } = useToast();
  useEffect(() => {
    function onOwnerOnly() {
      toast({
        title: "Only the owner profile can do that",
        description: "Switch to the owner profile to manage the library.",
        variant: "error",
      });
    }
    window.addEventListener(OWNER_ONLY_EVENT, onOwnerOnly);
    return () => window.removeEventListener(OWNER_ONLY_EVENT, onOwnerOnly);
  }, [toast]);
  return null;
}
