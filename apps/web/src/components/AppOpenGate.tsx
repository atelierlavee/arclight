// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { pkey } from "@/lib/profileStorage";
import { BrandLogo } from "@/components/BrandLogo";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import { AuthBackdrop } from "./AuthBackdrop";
import { useOwnPasskeys } from "@/lib/profile";
import { fetchPrivacyStatus } from "@/lib/privacyApi";
import { PrivacyUnlockForm } from "./PrivacyUnlockForm";
import { qk } from "@/lib/queryKeys";

const UNLOCK_KEY = "media-server:app-open-unlocked";

function readUnlocked(): boolean {
  try {
    return window.sessionStorage.getItem(pkey(UNLOCK_KEY)) === "true";
  } catch {
    return false;
  }
}

export function clearAppOpenUnlock(): void {
  try {
    window.sessionStorage.removeItem(pkey(UNLOCK_KEY));
  } catch {
    // Storage may be disabled; the next app mount will ask again.
  }
}

export function AppOpenGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(readUnlocked);
  const privacy = useQuery({ queryKey: qk.privacy, queryFn: fetchPrivacyStatus });
  const passkeys = useOwnPasskeys();

  if (privacy.isPending || passkeys.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (privacy.isError || passkeys.isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-3 text-center">
          <h1 className="text-lg font-semibold">Couldn’t check app lock</h1>
          <p className="text-sm text-muted-foreground">
            The privacy settings couldn’t be loaded. Check the connection and try again.
          </p>
          <button
            type="button"
            onClick={() => {
              void privacy.refetch();
              void passkeys.refetch();
            }}
            className="rounded-md bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const guarded = privacy.data.hasPassword || passkeys.data.length > 0;
  if (!guarded || unlocked) return <>{children}</>;

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-background px-4 md:px-6">
      <AuthBackdrop />
      <div className="relative w-full max-w-sm animate-fade-in space-y-6 rounded-2xl border border-white/10 bg-white/[0.035] p-7 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)] backdrop-blur-xl sm:p-8">
        <span
          aria-hidden
          className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#ff2d95]/70 to-transparent"
        />
        <BrandLogo size="md" />
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Lock className="size-5 text-[#ff2d95]" />
            Unlock Arc Light
          </h1>
          <p className="text-sm text-muted-foreground">
            Use your fingerprint or privacy password to open the app.
          </p>
        </div>
        <PrivacyUnlockForm
          onUnlocked={() => {
            try {
              window.sessionStorage.setItem(pkey(UNLOCK_KEY), "true");
            } catch {
              // Keep this mount usable even when browser storage is disabled.
            }
            setUnlocked(true);
          }}
        />
      </div>
    </div>
  );
}