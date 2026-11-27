// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Fingerprint, Info, KeyRound, Loader2, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { DISCREET_SHORTCUT } from "@/lib/appearance";
import { fetchPrivacyStatus, savePrivacyPassword } from "@/lib/privacyApi";
import { withPrivacyUnlock } from "@/lib/privacyLock";
import { deletePasskey, fetchPasskeys, registerPasskey } from "@/lib/webauthnApi";
import { SettingsSection, settingsInputClass } from "./SettingsSection";
import { cn } from "@/lib/utils";
import { qk } from "@/lib/queryKeys";
import { useProfile, useProofPrompt } from "@/lib/profile";

/**
 * The password that unlocks discreet mode.
 *
 * Lives here rather than in the Appearance panel because it's a one-time
 * setup, and because the panel is what you open in front of somebody — a
 * "change password" field sitting in it would be the obvious thing to attack.
 */
export function PrivacySettingsSection() {
  const [password, setPassword] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // Separate from the password error above: a Touch ID failure showing there
  // looked exactly like a rejected account password.
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  // Asked for at the moment of enrolling rather than shared with the field
  // above, which belongs to the privacy password: a passkey unlocks discreet
  // mode and the vault by itself, so the server wants the account password
  // before it will issue the challenge.
  const [enrolling, setEnrolling] = useState(false);
  const [enrollPassword, setEnrollPassword] = useState("");
  const queryClient = useQueryClient();
  // The owner confirms with the account password; another profile with its
  // own PIN, or nothing when it has none.
  const prompt = useProofPrompt();
  const { isOwner } = useProfile();

  const { data } = useQuery({ queryKey: qk.privacy, queryFn: fetchPrivacyStatus });
  const { data: passkeys } = useQuery({ queryKey: qk.passkeys, queryFn: fetchPasskeys });

  const addPasskey = useMutation({
    // Named after the browser it's registered in, since that's what the
    // credential is actually tied to and a Mac may hold several.
    mutationFn: () => registerPasskey(browserName(), prompt.toProof(enrollPassword)),
    onSuccess: () => {
      setPasskeyError(null);
      setEnrolling(false);
      setEnrollPassword("");
      queryClient.invalidateQueries({ queryKey: qk.passkeys });
    },
    onError: (err: Error) => setPasskeyError(err.message),
  });

  const removePasskey = useMutation({
    mutationFn: (id: string) => withPrivacyUnlock(() => deletePasskey(id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.passkeys }),
  });

  const save = useMutation({
    mutationFn: () => savePrivacyPassword(password, prompt.toProof(accountPassword)),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      setPassword("");
      setAccountPassword("");
      queryClient.invalidateQueries({ queryKey: qk.privacy });
    },
    onError: (err: Error) => {
      setSaved(false);
      setError(err.message);
    },
  });

  const hasPassword = Boolean(data?.hasPassword);
  const keyCount = passkeys?.length ?? 0;

  return (
    <SettingsSection
      title="Privacy"
      description={`Discreet mode blurs every image; ${DISCREET_SHORTCUT} turns it on from any page. A privacy password or Touch ID is what it takes to turn it off again, and to open the app in a new tab.`}
    >
      {/* Where things stand, in one line, before any field. */}
      <p
        className={cn(
          "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13px]",
          hasPassword || keyCount > 0
            ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-300/90"
            : "border-amber-500/25 bg-amber-500/5 text-amber-300/90",
        )}
      >
        {hasPassword || keyCount > 0 ? (
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        ) : (
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        )}
        {hasPassword
          ? "A privacy password is set. Enter a new one to replace it, or leave it blank to remove it."
          : keyCount > 0
            ? "No password set — Touch ID is the only way out of discreet mode. Set one as a fallback for a browser without your passkey."
            : "No privacy password yet — anyone at this screen can switch discreet mode off."}
      </p>

      <div className="space-y-3">
        <h4 className={subheading}>
          <KeyRound className="size-3.5" />
          Privacy password
        </h4>
        <div className={cn("grid gap-3", prompt.needed && "sm:grid-cols-2")}>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">{hasPassword ? "New privacy password" : "Privacy password"}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setSaved(false);
              }}
              placeholder={hasPassword ? "Blank to remove" : "At least 8 characters"}
              className={settingsInputClass}
            />
          </label>

          {prompt.needed && (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium">{prompt.label}</span>
              <input
                type="password"
                inputMode={prompt.numeric ? "numeric" : undefined}
                value={accountPassword}
                onChange={(event) => {
                  setAccountPassword(event.target.value);
                  setSaved(false);
                }}
                className={settingsInputClass}
              />
            </label>
          )}
        </div>
        {/* The way out if the privacy password is ever forgotten — without
            this, forgetting it would mean being stuck in discreet mode. */}
        {prompt.needed && isOwner && (
          <p className="text-[11px] text-muted-foreground/70">
            Your account password confirms it's you, and is what lets you reset a privacy password you've forgotten.
          </p>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || (prompt.needed && accountPassword.length === 0)}
            className="flex items-center gap-2 rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="size-3.5 animate-spin" />}
            {password ? "Save password" : hasPassword ? "Remove password" : "Save password"}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="size-3.5" />
              Saved
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3 border-t border-border/70 pt-4">
        <h4 className={subheading}>
          <Fingerprint className="size-3.5" />
          Touch ID
        </h4>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Unlock with your fingerprint instead of typing the password. It stays on this device — the
          browser only proves it checked. Registered per browser; the password keeps working either way.
        </p>

        {keyCount > 0 && (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
            {passkeys!.map((passkey) => (
              <li key={passkey.id} className="flex items-center gap-3 px-3 py-2">
                <Fingerprint className="size-4 text-primary" />
                <span className="flex-1 text-sm">{passkey.label}</span>
                <button
                  type="button"
                  onClick={() => removePasskey.mutate(passkey.id)}
                  aria-label={`Remove ${passkey.label}`}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {enrolling ? (
          <form
            className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (enrollPassword || !prompt.needed) addPasskey.mutate();
            }}
          >
            <label className="block space-y-1.5">
              <span className="text-xs font-medium">{prompt.label}</span>
              <input
                type="password"
                inputMode={prompt.numeric ? "numeric" : undefined}
                autoComplete={prompt.numeric ? "off" : "current-password"}
                autoFocus
                value={enrollPassword}
                onChange={(event) => {
                  setEnrollPassword(event.target.value);
                  setPasskeyError(null);
                }}
                className={settingsInputClass}
              />
              <span className="block text-[11px] text-muted-foreground/70">
                Touch ID unlocks discreet mode and the vault on its own, so adding it needs{" "}
                {prompt.numeric ? "your profile PIN" : "your password"}.
              </span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={addPasskey.isPending || enrollPassword.length === 0}
                className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {addPasskey.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Fingerprint className="size-3.5" />}
                Continue
              </button>
              <button
                type="button"
                onClick={() => {
                  setEnrolling(false);
                  setEnrollPassword("");
                  setPasskeyError(null);
                }}
                className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : !prompt.needed ? (
          <p className="text-[12px] text-muted-foreground">
            Set a PIN for your profile under Profiles below to add Touch ID.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setEnrolling(true)}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
          >
            <Fingerprint className="size-3.5" />
            {keyCount > 0 ? "Add another browser" : "Set up Touch ID"}
          </button>
        )}

        {passkeyError && <p className="text-xs text-destructive">{passkeyError}</p>}
      </div>

      <p className="flex gap-2 rounded-lg bg-secondary/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" />
        Discreet mode is a blur drawn by your browser. It stops a glance over your shoulder — it won't
        stop someone who opens developer tools or clears site data.
      </p>
    </SettingsSection>
  );
}

const subheading = "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground";

/** A rough name for the browser being registered, so the list is readable. */
function browserName(): string {
  const agent = navigator.userAgent;
  if (agent.includes("Firefox")) return "Firefox";
  // Chrome's user agent claims Safari too, so the order matters here.
  if (agent.includes("Edg")) return "Edge";
  if (agent.includes("Chrome")) return "Chrome";
  if (agent.includes("Safari")) return "Safari";
  return "This browser";
}
