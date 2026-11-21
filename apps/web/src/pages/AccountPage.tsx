import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BarChart3, ChevronRight, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SettingsFeedback, SettingsSection, settingsInputClass } from "@/components/SettingsSection";
import { changePassword, fetchAuthStatus, updateUsername } from "@/lib/authApi";
import { useProfile } from "@/lib/profile";
import { displayName, updateProfile, type CurrentProfile, type Proof } from "@/lib/profilesApi";
import { ConfirmIdentityDialog } from "@/components/ConfirmIdentityDialog";
import { ProfileAvatar } from "@/components/ProfilePicker";
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
    <SettingsSection title="Your details" description="Your name is how the home page greets you.">
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
        className="flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
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

/** Your profile: who you are, a way into your stats, and your sign-in details. */
export function AccountPage() {
  const { data: auth } = useQuery({ queryKey: qk.authStatus, queryFn: fetchAuthStatus });
  const { profile, isOwner } = useProfile();
  const username = profile?.name ?? auth?.user?.username ?? "";
  const name = profile ? displayName(profile) : username;

  return (
    <AppShell>
      <div className="stagger mx-auto w-full max-w-2xl space-y-5 px-4 py-6 md:px-6 md:py-8">
        <div className="flex items-center gap-4">
          {profile ? (
            <ProfileAvatar
              name={profile.name}
              color={profile.color}
              className="size-12 rounded-full text-lg"
            />
          ) : (
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-lg font-semibold ring-1 ring-border">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="sensitive truncate text-xl font-bold tracking-tight">{name}</h1>
            <p className="sensitive text-sm text-muted-foreground">
              {name !== username ? `@${username}` : "Profile"}
            </p>
          </div>
        </div>

        <Link
          to="/stats"
          className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-secondary/40"
        >
          <BarChart3 className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Your stats</span>
            <span className="block text-xs text-muted-foreground">
              Hours watched, streaks and your year in review
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>

        {/* The sign-in account belongs to the owner; other profiles manage
            their own name, colour and PIN under Settings → Profiles. */}
        <AccountForm profile={profile} isOwner={isOwner} />
      </div>
    </AppShell>
  );
}
