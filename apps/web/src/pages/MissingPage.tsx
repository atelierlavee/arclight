import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MissingSection } from "@/components/MissingSection";
import { PrivacyUnlockForm } from "@/components/PrivacyUnlockForm";
import { usePrivacyGuard } from "@/lib/privacyGuard";
import { useIsOwner } from "@/lib/profile";
import { OwnerOnlyPage } from "@/components/OwnerOnly";

/**
 * Missing videos, behind the privacy credential.
 *
 * The only page in the app that can destroy anything, so it is the only one
 * that asks who you are a second time. The prompt here is a courtesy: the
 * endpoints refuse a session that has not proved the credential regardless of
 * what this component decides to render, so getting past this screen by other
 * means gains nothing.
 */
/** The owner profile's page; anyone else is told so. */
export function MissingPage() {
  return useIsOwner() ? <MissingPageContent /> : <OwnerOnlyPage title="Missing videos" />;
}

function MissingPageContent() {
  const { guarded, hasPassword, hasPasskey } = usePrivacyGuard();
  const [unlocked, setUnlocked] = useState(false);

  if (guarded && !unlocked) {
    return (
      <AppShell title="Missing videos">
        <div className="mx-auto mt-12 max-w-sm rounded-lg border border-border bg-card/60 p-6">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="size-5 shrink-0 text-amber-500" />
            <h2 className="font-semibold tracking-tight">Locked</h2>
          </div>
          <p className="mb-4 mt-2 text-sm text-muted-foreground">
            This page can remove videos from your library. Unlock it with your
            privacy {hasPasskey && hasPassword ? "passkey or password" : hasPasskey ? "passkey" : "password"}.
          </p>
          <PrivacyUnlockForm
            onUnlocked={() => setUnlocked(true)}
            onCancel={() => setUnlocked(false)}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Missing videos">
      {/* Nothing set means nothing to prove, and the server agrees — it would
          rather leave this open than lock the owner out permanently. Said
          plainly here, since the whole point of the page is that it is the
          dangerous one. */}
      {!guarded && (
        <div className="mb-5 flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <p className="text-muted-foreground">
            This page is unprotected — no privacy password or passkey is set,
            so anyone with access to this browser can remove videos here.{" "}
            <Link
              to="/settings"
              search={{ tab: "privacy" }}
              className="text-foreground underline underline-offset-2"
            >
              Set one in Privacy settings
            </Link>
            .
          </p>
        </div>
      )}
      <MissingSection onLocked={() => setUnlocked(false)} />
    </AppShell>
  );
}
