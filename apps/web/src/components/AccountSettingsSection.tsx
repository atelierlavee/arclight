// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Fingerprint, KeyRound, Loader2, ShieldCheck, ShieldOff, type LucideIcon } from "lucide-react";
import { SettingsFeedback, SettingsSection, settingsInputClass } from "@/components/SettingsSection";
import { changePassword, fetchAuthStatus, updateUsername } from "@/lib/authApi";
import { useProfile } from "@/lib/profile";
import { displayName, updateProfile, type CurrentProfile, type Proof } from "@/lib/profilesApi";
import { fetchPrivacyStatus } from "@/lib/privacyApi";
import { fetchPasskeys } from "@/lib/webauthnApi";
import { ProfileAvatar } from "@/components/ProfilePicker";
import { cn } from "@/lib/utils";
import { ConfirmIdentityDialog } from "@/components/ConfirmIdentityDialog";
import { qk } from "@/lib/queryKeys";

const MIN_PASSWORD_LENGTH = 8;

const fieldLabel = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground";

/**
 * Everything about you, in one form with one Save: your name (every
 * profile), and for the owner the sign-in username and password. Save sends
 * only what changed; the password is only changed when a new one is typed,
 * so a browser filling in the current one changes nothing by itself.
 */
function AccountForm({ profile, isOwner }: { profile: CurrentProfile | null; isOwner: boolean }) {
  const queryClient = useQueryClient();
  const { data: auth } = useQuery({ queryKey: qk.authStatus, queryFn: fetchAuthStatus });
  const savedUsername = auth?.user?.username ?? "";

  const [first, setFirst] = useState(profile?.firstName ?? "");
  const [last, setLast] = useState(profile?.lastName ?? "");
  const [username, setUsername] = useState(savedUsername);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // When the saved values change (loaded, or saved from here), the fields
  // follow — adjusted during render rather than in an effect.
  const source = `${profile?.firstName ?? ""}\u0000${profile?.lastName ?? ""}\u0000${savedUsername}`;
  const [syncedFrom, setSyncedFrom] = useState(source);
  if (syncedFrom !== source) {
    setSyncedFrom(source);
    setFirst(profile?.firstName ?? "");
    setLast(profile?.lastName ?? "");
    setUsername(savedUsername);
  }

  const nameChanged =
    profile !== null &&
    (first.trim() !== (profile.firstName ?? "") || last.trim() !== (profile.lastName ?? ""));
  const usernameChanged = isOwner && username.trim() !== savedUsername && username.trim().length > 0;
  const passwordChanged = isOwner && next.length > 0;
  const dirty = nameChanged || usernameChanged || passwordChanged;

  // Any change needs proof it's you, asked for in a dialog when Save is pressed.
  const [confirming, setConfirming] = useState(false);
  // A non-owner without a PIN has nothing to prove; the server asks nothing.
  const needsProof = isOwner || Boolean(profile?.hasPin);

  function checkFields(): string | null {
    if (!passwordChanged) return null;
    if (next.length < MIN_PASSWORD_LENGTH)
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    if (next !== confirm) return "New passwords don’t match";
    if (!current) return "Enter your current password to change it";
    return null;
  }

  async function saveAll(proof: Proof | null) {
    if (nameChanged && profile) {
      await updateProfile(profile.id, { firstName: first.trim(), lastName: last.trim() }, proof);
    }
    if (usernameChanged) await updateUsername(username.trim(), proof);
    if (passwordChanged) await changePassword(current, next);
    setSaved(true);
    setCurrent("");
    setNext("");
    setConfirm("");
    queryClient.invalidateQueries({ queryKey: qk.authStatus });
    queryClient.invalidateQueries({ queryKey: qk.profiles });
  }

  const save = useMutation({
    mutationFn: () => saveAll(null),
    onError: (err) => setError(err instanceof Error ? err.message : "That didn't save"),
  });

  function onSave() {
    setError(null);
    setSaved(false);
    const problem = checkFields();
    if (problem) {
      setError(problem);
      return;
    }
    // Only the name and username need proof; a password change already
    // carries the current password.
    if (needsProof && (nameChanged || usernameChanged)) setConfirming(true);
    else save.mutate();
  }

  const touch =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setSaved(false);
      setError(null);
    };

  return (
    <SettingsSection
      title="Your details"
      description={
        isOwner
          ? "Your name is how the home page greets you. The username and password are how this server is signed in to."
          : "Your name is how the home page greets you."
      }
    >
      <div className="space-y-6">
        {profile && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={fieldLabel}>First name</span>
              <input
                value={first}
                onChange={(e) => touch(setFirst)(e.target.value)}
                placeholder="First name"
                autoComplete="given-name"
                maxLength={40}
                className={settingsInputClass}
              />
            </label>
            <label className="block">
              <span className={fieldLabel}>Last name</span>
              <input
                value={last}
                onChange={(e) => touch(setLast)(e.target.value)}
                placeholder="Last name"
                autoComplete="family-name"
                maxLength={40}
                className={settingsInputClass}
              />
            </label>
          </div>
        )}

        {/* The sign-in account belongs to the owner; other profiles manage
            their own colour and PIN under Settings → Profiles. */}
        {isOwner && (
          <label className="block">
            <span className={fieldLabel}>Username</span>
            <input
              value={username}
              onChange={(e) => touch(setUsername)(e.target.value)}
              placeholder="Username"
              autoComplete="username"
              className={settingsInputClass}
            />
            <span className="mt-1.5 block text-xs text-muted-foreground">The name you sign in with.</span>
          </label>
        )}

        {isOwner && (
          <div>
            <span className={fieldLabel}>Change password</span>
            <div className="space-y-3">
              <input
                value={current}
                onChange={(e) => touch(setCurrent)(e.target.value)}
                type="password"
                placeholder="Current password"
                autoComplete="current-password"
                className={settingsInputClass}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={next}
                  onChange={(e) => touch(setNext)(e.target.value)}
                  type="password"
                  placeholder="New password"
                  autoComplete="new-password"
                  className={settingsInputClass}
                />
                <input
                  value={confirm}
                  onChange={(e) => touch(setConfirm)(e.target.value)}
                  type="password"
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  className={settingsInputClass}
                />
              </div>
            </div>
            <span className="mt-1.5 block text-xs text-muted-foreground">
              Leave blank to keep your password. Changing it signs out every other device.
            </span>
          </div>
        )}
      </div>

      <SettingsFeedback error={error} saved={saved && !dirty} />
      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || save.isPending}
        className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {save.isPending && <Loader2 className="size-4 animate-spin" />}
        Save changes
      </button>
      {confirming && (
        <ConfirmIdentityDialog isOwner={isOwner} run={saveAll} onClose={() => setConfirming(false)} />
      )}
    </SettingsSection>
  );
}

/**
 * Your details, on the Settings page's Personal chapter: your name, and for
 * the owner the sign-in username and password. It used to be its own page
 * behind "Profile" in the account menu.
 */
export function AccountSettingsSection() {
  const { profile, isOwner } = useProfile();
  return <AccountForm profile={profile} isOwner={isOwner} />;
}

/**
 * The top of the Personal card: who you are and how you're protected, at a
 * glance, so most visits don't need to read the forms underneath.
 */
export function PersonalSummary() {
  const { profile, isOwner } = useProfile();
  const { data: auth } = useQuery({ queryKey: qk.authStatus, queryFn: fetchAuthStatus });
  const { data: privacy } = useQuery({ queryKey: qk.privacy, queryFn: fetchPrivacyStatus });
  const { data: passkeys } = useQuery({ queryKey: qk.passkeys, queryFn: fetchPasskeys });

  const username = auth?.user?.username ?? "";
  const name = profile ? displayName(profile) : username;
  const handle = profile?.name ?? username;
  const keys = passkeys?.length ?? 0;

  const chips: { icon: LucideIcon; label: string; tone: "ok" | "warn" | "plain" }[] = [
    isOwner
      ? { icon: Crown, label: "Owner", tone: "plain" }
      : { icon: KeyRound, label: profile?.hasPin ? "PIN set" : "No PIN", tone: profile?.hasPin ? "ok" : "plain" },
    privacy?.hasPassword
      ? { icon: ShieldCheck, label: "Privacy password set", tone: "ok" }
      : { icon: ShieldOff, label: "No privacy password", tone: "warn" },
    {
      icon: Fingerprint,
      label: keys ? `Touch ID on ${keys} ${keys === 1 ? "browser" : "browsers"}` : "No Touch ID",
      tone: keys ? "ok" : "plain",
    },
  ];

  return (
    <div className="flex flex-col gap-4 bg-gradient-to-br from-primary/10 via-transparent to-transparent p-5 sm:flex-row sm:items-center md:p-6">
      <ProfileAvatar
        name={profile?.name ?? (username || "?")}
        color={profile?.color}
        className="size-16 shrink-0 rounded-full text-2xl ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
      />
      <div className="min-w-0 flex-1">
        <p className="sensitive truncate text-lg font-semibold tracking-tight">{name || "\u00a0"}</p>
        {handle && handle !== name && (
          <p className="sensitive truncate text-sm text-muted-foreground">@{handle}</p>
        )}
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {chips.map(({ icon: Icon, label, tone }) => (
            <li
              key={label}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px]",
                tone === "ok" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
                tone === "warn" && "border-amber-500/30 bg-amber-500/10 text-amber-400",
                tone === "plain" && "border-border bg-secondary/50 text-muted-foreground",
              )}
            >
              <Icon className="size-3" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
