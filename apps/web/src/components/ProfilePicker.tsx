import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clapperboard, Delete, Loader2, Lock, Settings2 } from "lucide-react";
import {
  DEFAULT_PROFILE_COLOR,
  MAX_PIN_LENGTH,
  MIN_PIN_LENGTH,
  fetchProfiles,
  profileInitial,
  selectProfile,
  type Profile,
} from "@/lib/profilesApi";
import { qk } from "@/lib/queryKeys";

/** A coloured initial: the face of a profile everywhere it appears. */
export function ProfileAvatar({
  name,
  color,
  className = "size-9 text-sm",
}: {
  name: string;
  color?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ backgroundColor: color ?? DEFAULT_PROFILE_COLOR }}
      className={`flex shrink-0 items-center justify-center rounded-md font-semibold text-white ${className}`}
    >
      {profileInitial(name)}
    </span>
  );
}

/**
 * "Who's watching?" — shown full-screen after sign-in until a profile is
 * picked, and again whenever the server says the session has none.
 *
 * Tiles are buttons, so Tab and Enter work without a mouse. A PIN-protected
 * profile opens a PIN pad that also takes the number keys directly.
 */
export function ProfilePicker() {
  const queryClient = useQueryClient();
  const profiles = useQuery({ queryKey: qk.profiles, queryFn: fetchProfiles });
  const [pinFor, setPinFor] = useState<Profile | null>(null);
  const [manage, setManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  async function entered() {
    // A full load straight onto the section: the router isn't mounted while
    // the picker is up, and this is a rare path.
    if (manage) {
      window.location.assign("/settings?tab=profiles");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: qk.authStatus });
  }

  async function choose(profile: Profile) {
    setError(null);
    if (profile.hasPin) {
      setPinFor(profile);
      return;
    }
    setBusy(profile.id);
    try {
      const result = await selectProfile(profile.id);
      if (result.ok) await entered();
      else setPinFor(profile);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't open that profile");
    } finally {
      setBusy(null);
    }
  }

  const list = profiles.data ?? [];
  const owner = list.find((profile) => profile.isOwner);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10 md:px-6">
      <div className="mb-10 flex items-center gap-2">
        <Clapperboard className="size-6" />
        <span className="text-xl font-bold tracking-tight">Arc Light</span>
      </div>

      {pinFor ? (
        <PinPad profile={pinFor} onBack={() => setPinFor(null)} onEntered={entered} />
      ) : (
        <div className="w-full max-w-3xl space-y-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {manage ? "Manage profiles" : "Who’s watching?"}
          </h1>
          {manage && (
            <p className="text-sm text-muted-foreground">
              Profiles are managed from the owner profile. Open it to continue.
            </p>
          )}

          {profiles.isPending && (
            <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
          )}
          {profiles.isError && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">The profiles couldn’t be loaded.</p>
              <button
                type="button"
                onClick={() => void profiles.refetch()}
                className="rounded-md bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                Try again
              </button>
            </div>
          )}

          <ul className="flex flex-wrap justify-center gap-5 md:gap-8">
            {(manage && owner ? [owner] : list).map((profile) => (
              <li key={profile.id}>
                <button
                  type="button"
                  onClick={() => void choose(profile)}
                  disabled={busy !== null}
                  aria-label={`${profile.name}${profile.hasPin ? " (PIN protected)" : ""}`}
                  className="group flex w-24 flex-col items-center gap-2 rounded-lg p-1 outline-none disabled:opacity-60 md:w-32"
                >
                  <span className="relative">
                    <ProfileAvatar
                      name={profile.name}
                      color={profile.color}
                      className="size-24 text-4xl ring-offset-2 ring-offset-background transition group-hover:ring-2 group-hover:ring-foreground group-focus-visible:ring-2 group-focus-visible:ring-foreground md:size-32 md:text-5xl"
                    />
                    {busy === profile.id && (
                      <Loader2 className="absolute inset-0 m-auto size-6 animate-spin text-white" />
                    )}
                  </span>
                  <span className="flex max-w-full items-center gap-1 truncate text-sm text-muted-foreground group-hover:text-foreground">
                    <span className="truncate">{profile.name}</span>
                    {profile.hasPin && <Lock className="size-3 shrink-0" aria-hidden />}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {error && (
            <p className="mx-auto max-w-sm rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {owner && (
            <button
              type="button"
              onClick={() => setManage((on) => !on)}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {manage ? <ArrowLeft className="size-4" /> : <Settings2 className="size-4" />}
              {manage ? "Back" : "Manage profiles"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** The PIN entry for one profile, with attempts left and the lockout countdown. */
export function PinPad({
  profile,
  onBack,
  onEntered,
}: {
  profile: Profile;
  onBack: () => void;
  onEntered: () => Promise<void> | void;
}) {
  const [pin, setPin] = useState("");
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [lockedFor, setLockedFor] = useState(0);

  const locked = lockedFor > 0;

  useEffect(() => {
    if (!locked) return;
    const timer = window.setInterval(() => setLockedFor((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [locked]);

  async function submit(value = pin) {
    if (value.length < MIN_PIN_LENGTH || checking || locked) return;
    setChecking(true);
    setProblem(null);
    try {
      const result = await selectProfile(profile.id, value);
      if (result.ok) {
        await onEntered();
        return;
      }
      setPin("");
      if (result.reason === "throttled") {
        setLockedFor(result.retryAfterSeconds);
      } else if (result.attemptsLeft === 0) {
        setProblem("Wrong PIN. No attempts left for now.");
      } else {
        setProblem(
          result.attemptsLeft === undefined
            ? "Wrong PIN."
            : `Wrong PIN. ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? "" : "s"} left.`,
        );
      }
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : "Couldn't check the PIN");
    } finally {
      setChecking(false);
    }
  }

  function press(key: string) {
    if (locked || checking) return;
    setProblem(null);
    setPin((current) => (current.length >= MAX_PIN_LENGTH ? current : current + key));
  }

  // The number keys work straight away — no field to click into first.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        press(event.key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        setPin((current) => current.slice(0, -1));
      } else if (event.key === "Enter") {
        // A focused button (Back, a digit) should activate itself, not
        // submit the PIN.
        if (event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        void submit();
      } else if (event.key === "Escape") {
        onBack();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const padButton =
    "flex h-14 items-center justify-center rounded-lg bg-secondary text-lg font-semibold transition-colors hover:bg-accent disabled:opacity-50";

  return (
    <div className="w-full max-w-xs space-y-6 text-center" role="group" aria-label={`PIN for ${profile.name}`}>
      <div className="flex flex-col items-center gap-3">
        <ProfileAvatar name={profile.name} color={profile.color} className="size-20 text-3xl" />
        <h1 className="text-lg font-semibold">Enter {profile.name}’s PIN</h1>
      </div>

      <div className="flex justify-center gap-2" aria-live="polite" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(MIN_PIN_LENGTH, pin.length) }, (_, i) => (
          <span
            key={i}
            className={`size-3 rounded-full ${i < pin.length ? "bg-foreground" : "bg-secondary ring-1 ring-border"}`}
          />
        ))}
      </div>

      {locked ? (
        <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
          Too many attempts. Try again in {lockedFor}s.
        </p>
      ) : (
        problem && (
          <p role="alert" className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
            {problem}
          </p>
        )
      )}

      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button key={key} type="button" className={padButton} disabled={locked || checking} onClick={() => press(key)}>
            {key}
          </button>
        ))}
        <button
          type="button"
          className={padButton}
          aria-label="Delete digit"
          disabled={locked || checking || pin.length === 0}
          onClick={() => setPin((current) => current.slice(0, -1))}
        >
          <Delete className="size-5" />
        </button>
        <button type="button" className={padButton} disabled={locked || checking} onClick={() => press("0")}>
          0
        </button>
        <button
          type="button"
          className={`${padButton} bg-white text-black hover:bg-white/90`}
          disabled={locked || checking || pin.length < MIN_PIN_LENGTH}
          onClick={() => void submit()}
        >
          {checking ? <Loader2 className="size-5 animate-spin" /> : "OK"}
        </button>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to profiles
      </button>
    </div>
  );
}
