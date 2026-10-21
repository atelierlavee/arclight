import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { invalidateKeys } from "@/lib/invalidate";
import { useProfile } from "@/lib/profile";
import {
  DEFAULT_PROFILE_COLOR,
  MAX_PIN_LENGTH,
  MIN_PIN_LENGTH,
  PROFILE_COLORS,
  createProfile,
  deleteProfile,
  fetchProfiles,
  resetProfileSecrets,
  setProfilePin,
  updateProfile,
  type Profile,
} from "@/lib/profilesApi";
import { qk } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { ProfileAvatar } from "./ProfilePicker";
import { SettingsSection, settingsInputClass } from "./SettingsSection";

const PIN_PATTERN = new RegExp(`^\\d{${MIN_PIN_LENGTH},${MAX_PIN_LENGTH}}$`);

function errorText(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

function ErrorLine({ error }: { error: unknown }) {
  const text = errorText(error);
  if (!text) return null;
  return <p className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">{text}</p>;
}

const primaryButton =
  "inline-flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50";
const quietButton =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

function useRefreshProfiles() {
  const queryClient = useQueryClient();
  // Auth status carries the current profile's name and colour.
  return () => invalidateKeys(queryClient, [qk.profiles, qk.authStatus]);
}

function ColorChoice({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
      {PROFILE_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          onClick={() => onChange(color)}
          style={{ backgroundColor: color }}
          className={cn(
            "size-7 rounded-full ring-offset-2 ring-offset-card",
            value === color && "ring-2 ring-foreground",
          )}
        />
      ))}
    </div>
  );
}

/**
 * Settings → Profiles.
 *
 * The owner sees every profile and manages them all; anyone else sees only
 * their own card — name, colour and PIN.
 */
export function ProfilesSettingsSection() {
  const { profile: current, isOwner } = useProfile();
  const profiles = useQuery({ queryKey: qk.profiles, queryFn: fetchProfiles });

  const visible = (profiles.data ?? []).filter(
    (profile) => isOwner || profile.id === current?.id,
  );

  return (
    <SettingsSection
      title="Profiles"
      description={
        isOwner
          ? "Everyone who watches gets their own history, favourites, ratings, bookmarks, vault and appearance. Only the owner profile manages the library."
          : "Your name, colour and PIN. Your history, favourites and vault are yours alone."
      }
    >
      {profiles.isPending && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
      <ErrorLine error={profiles.error} />
      <ul className="space-y-3">
        {visible.map((profile) => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            isSelf={profile.id === current?.id}
            canManage={isOwner}
          />
        ))}
      </ul>
      {isOwner && <AddProfile />}
    </SettingsSection>
  );
}

function AddProfile() {
  const refresh = useRefreshProfiles();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_PROFILE_COLOR);
  const create = useMutation({
    mutationFn: () => createProfile({ name: name.trim(), color }),
    onSuccess: () => {
      refresh();
      setOpen(false);
      setName("");
    },
  });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={quietButton}>
        <Plus className="size-4" />
        Add profile
      </button>
    );
  }
  return (
    <form
      className="space-y-3 rounded-md border border-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) create.mutate();
      }}
    >
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name"
        aria-label="New profile name"
        autoFocus
        className={settingsInputClass}
      />
      <ColorChoice value={color} onChange={setColor} />
      <ErrorLine error={create.error} />
      <div className="flex gap-2">
        <button type="submit" disabled={!name.trim() || create.isPending} className={primaryButton}>
          {create.isPending && <Loader2 className="size-4 animate-spin" />}
          Add profile
        </button>
        <button type="button" onClick={() => setOpen(false)} className={quietButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}

type Mode = "edit" | "pin" | "reset" | "delete" | null;

function ProfileCard({
  profile,
  isSelf,
  canManage,
}: {
  profile: Profile;
  isSelf: boolean;
  canManage: boolean;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const toggle = (next: Mode) => setMode((m) => (m === next ? null : next));

  return (
    <li className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-3">
        <ProfileAvatar name={profile.name} color={profile.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {profile.name}
            {isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {profile.isOwner ? "Owner" : "Profile"} · {profile.hasPin ? "PIN set" : "No PIN"}
          </p>
        </div>
        {(isSelf || canManage) && (
          <button type="button" onClick={() => toggle("edit")} className={quietButton}>
            <Pencil className="size-3.5" />
            Edit
          </button>
        )}
        {(isSelf || canManage) && (
          <button type="button" onClick={() => toggle("pin")} className={quietButton}>
            <KeyRound className="size-3.5" />
            PIN
          </button>
        )}
        {canManage && !isSelf && (
          <button type="button" onClick={() => toggle("reset")} className={quietButton}>
            <RotateCcw className="size-3.5" />
            Reset
          </button>
        )}
        {canManage && !profile.isOwner && (
          <button
            type="button"
            onClick={() => toggle("delete")}
            className={cn(quietButton, "hover:text-destructive")}
          >
            <Trash2 className="size-3.5" />
            Delete
          </button>
        )}
      </div>
      {mode === "edit" && <EditProfile profile={profile} onDone={() => setMode(null)} />}
      {mode === "pin" && <PinEditor profile={profile} isSelf={isSelf} onDone={() => setMode(null)} />}
      {mode === "reset" && <ResetSecrets profile={profile} onDone={() => setMode(null)} />}
      {mode === "delete" && <DeleteProfile profile={profile} onDone={() => setMode(null)} />}
    </li>
  );
}

function EditProfile({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const refresh = useRefreshProfiles();
  const [name, setName] = useState(profile.name);
  const [color, setColor] = useState(profile.color);
  const save = useMutation({
    mutationFn: () => updateProfile(profile.id, { name: name.trim(), color }),
    onSuccess: () => {
      refresh();
      onDone();
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) save.mutate();
      }}
    >
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label="Profile name"
        className={settingsInputClass}
      />
      <ColorChoice value={color} onChange={setColor} />
      <ErrorLine error={save.error} />
      <button type="submit" disabled={!name.trim() || save.isPending} className={primaryButton}>
        Save
      </button>
    </form>
  );
}

/**
 * Set, change or remove a PIN. Your own needs the current PIN when one is
 * set; the owner resetting someone else's gives the account password instead.
 */
function PinEditor({
  profile,
  isSelf,
  onDone,
}: {
  profile: Profile;
  isSelf: boolean;
  onDone: () => void;
}) {
  const refresh = useRefreshProfiles();
  const [proof, setProof] = useState("");
  const [newPin, setNewPin] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const needsCurrent = isSelf && profile.hasPin;
  const needsPassword = !isSelf;

  const save = useMutation({
    mutationFn: (pin: string | null) =>
      setProfilePin(profile.id, {
        newPin: pin,
        ...(needsCurrent ? { currentPin: proof } : {}),
        ...(needsPassword ? { accountPassword: proof } : {}),
      }),
    onSuccess: () => {
      refresh();
      onDone();
    },
  });

  function submit(pin: string | null) {
    setLocalError(null);
    if (pin !== null && !PIN_PATTERN.test(pin)) {
      setLocalError(`A PIN is ${MIN_PIN_LENGTH}–${MAX_PIN_LENGTH} digits.`);
      return;
    }
    save.mutate(pin);
  }

  const proofMissing = (needsCurrent || needsPassword) && !proof;

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit(newPin);
      }}
    >
      {needsCurrent && (
        <input
          value={proof}
          onChange={(event) => setProof(event.target.value.replace(/\D/g, ""))}
          type="password"
          inputMode="numeric"
          placeholder="Current PIN"
          aria-label="Current PIN"
          className={settingsInputClass}
        />
      )}
      {needsPassword && (
        <input
          value={proof}
          onChange={(event) => setProof(event.target.value)}
          type="password"
          placeholder="Account password"
          aria-label="Account password"
          autoComplete="current-password"
          className={settingsInputClass}
        />
      )}
      <input
        value={newPin}
        onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, MAX_PIN_LENGTH))}
        type="password"
        inputMode="numeric"
        placeholder={profile.hasPin ? "New PIN" : "PIN"}
        aria-label="New PIN"
        className={settingsInputClass}
      />
      {localError && <ErrorLine error={new Error(localError)} />}
      <ErrorLine error={save.error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={proofMissing || !newPin || save.isPending} className={primaryButton}>
          {profile.hasPin ? (isSelf ? "Change PIN" : "Reset PIN") : "Set PIN"}
        </button>
        {profile.hasPin && (
          <button
            type="button"
            disabled={proofMissing || save.isPending}
            onClick={() => submit(null)}
            className={cn(quietButton, "hover:text-destructive")}
          >
            Remove PIN
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * The owner's way back in for someone who forgot their vault PIN or privacy
 * password. Clearing is all it does — the person sets new ones themselves, so
 * the owner never learns them.
 */
function ResetSecrets({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [vaultPin, setVaultPin] = useState(true);
  const [privacyPassword, setPrivacyPassword] = useState(true);
  const reset = useMutation({
    mutationFn: () =>
      resetProfileSecrets(profile.id, {
        accountPassword: password,
        ...(vaultPin ? { vaultPin: true as const } : {}),
        ...(privacyPassword ? { privacyPassword: true as const } : {}),
      }),
    onSuccess: onDone,
  });
  const nothingChosen = !vaultPin && !privacyPassword;
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (password && !nothingChosen) reset.mutate();
      }}
    >
      <p className="text-sm text-muted-foreground">
        Clears {profile.name}’s chosen secrets so they can set new ones. Their vault keeps its
        items.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={vaultPin} onChange={(e) => setVaultPin(e.target.checked)} />
        Vault PIN
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={privacyPassword}
          onChange={(e) => setPrivacyPassword(e.target.checked)}
        />
        Privacy password
      </label>
      <input
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        type="password"
        placeholder="Account password"
        aria-label="Account password"
        autoComplete="current-password"
        className={settingsInputClass}
      />
      <ErrorLine error={reset.error} />
      <button
        type="submit"
        disabled={!password || nothingChosen || reset.isPending}
        className={primaryButton}
      >
        Reset
      </button>
    </form>
  );
}

function DeleteProfile({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const refresh = useRefreshProfiles();
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    mutationFn: () => deleteProfile(profile.id),
    onSuccess: () => {
      refresh();
      onDone();
    },
  });
  const matches = typed.trim() === profile.name;
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (matches) remove.mutate();
      }}
    >
      <p className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
        Deleting {profile.name} also deletes their watch history, favourites, ratings, bookmarks
        and vault. This can’t be undone.
      </p>
      <input
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        placeholder={`Type ${profile.name} to confirm`}
        aria-label="Type the profile name to confirm"
        className={settingsInputClass}
      />
      <ErrorLine error={remove.error} />
      <button
        type="submit"
        disabled={!matches || remove.isPending}
        className="inline-flex items-center gap-2 rounded-md bg-destructive px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {remove.isPending && <Loader2 className="size-4 animate-spin" />}
        Delete profile
      </button>
    </form>
  );
}
