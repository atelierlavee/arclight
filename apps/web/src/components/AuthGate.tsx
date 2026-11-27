// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Fingerprint, Loader2, Lock, Server, Smartphone, WifiOff } from "lucide-react";
import {
  LanBlockedError,
  fetchAuthStatus,
  login,
  recoverPassword,
  requestServerResetCode,
  setupAccount,
} from "@/lib/authApi";
import { loginWithPasskey } from "@/lib/webauthnApi";
import { AppOpenGate, clearAppOpenUnlock } from "./AppOpenGate";
import { ProfilePicker } from "./ProfilePicker";
import { ProfileProvider } from "./ProfileProvider";
import { qk } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { CinemaPanel } from "./AuthBackdrop";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Decides between the setup screen, the login screen and the app.
 *
 * Wrapping the router rather than guarding each route means a new page is
 * behind auth by default, matching the server's deny-by-default hook.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data: status, isLoading, error } = useQuery({
    queryKey: qk.authStatus,
    queryFn: fetchAuthStatus,
    // A 401 from anywhere else means the session died; re-checking on focus
    // moves you to the login screen rather than leaving a broken page.
    refetchOnWindowFocus: true,
    // Retrying a refusal just delays the explanation by a few seconds.
    retry: (count, cause) => !(cause instanceof LanBlockedError) && count < 3,
  });

  useEffect(() => {
    if (status && !status.user) clearAppOpenUnlock();
  }, [status]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // The page itself is served by the dev server, which knows nothing about
  // this — so without saying so, a blocked phone would sit on a login form
  // that refuses every attempt for reasons it never explains.
  if (error instanceof LanBlockedError) return <LanBlocked />;

  if (status?.user) {
    // Signed in but nobody picked yet. `undefined` (no field at all) is a
    // server without profiles, which carries on single-user.
    if (status.profile === null) return <ProfilePicker />;
    return (
      <ProfileProvider profile={status.profile}>
        {/* Keyed on the profile so a switch remounts the whole app: the
            appearance and queue providers re-read for the new person. */}
        <AppOpenGate key={status.profile?.id ?? "single"}>{children}</AppOpenGate>
      </ProfileProvider>
    );
  }

  return (
    <AuthForm
      mode={status?.needsSetup ? "setup" : "login"}
      authenticator={status?.recovery?.authenticator ?? false}
      onSuccess={() => {
        clearAppOpenUnlock();
        return queryClient.invalidateQueries({ queryKey: qk.authStatus });
      }}
    />
  );
}

function LanBlocked() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm space-y-3 text-center">
        <WifiOff className="mx-auto size-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold tracking-tight">Not available here</h1>
        <p className="text-sm text-muted-foreground">
          This server is set to answer only on the machine it runs on. Turn on
          local network access in Settings → Privacy there, and reload this page.
        </p>
      </div>
    </div>
  );
}

function AuthForm({
  mode,
  authenticator,
  onSuccess,
}: {
  mode: "setup" | "login";
  /** Whether an authenticator app is set up, for "Forgot password?". */
  authenticator: boolean;
  onSuccess: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isSetup = mode === "setup";

  const submit = useMutation({
    mutationFn: () => (isSetup ? setupAccount(username, password) : login(username, password)),
    onSuccess,
  });
  const passkey = useMutation({
    mutationFn: loginWithPasskey,
    onSuccess,
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLocalError(null);
    passkey.reset();

    if (isSetup) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setLocalError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        return;
      }
      if (password !== confirm) {
        setLocalError("Passwords don’t match");
        return;
      }
    }
    submit.mutate();
  }

  const error = localError
    ?? (passkey.error instanceof Error ? passkey.error.message : null)
    ?? (submit.error instanceof Error ? submit.error.message : null);

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1.25fr_1fr]">
      {/* The poster: a short banner on a phone, the whole left side on a wide screen. */}
      <CinemaPanel>
        <div className="relative px-6 pb-12 pt-28 sm:px-10 lg:px-16 lg:pb-20">
          <BrandLogo size="hero" />
          <p className="mt-6 hidden max-w-md text-base leading-relaxed text-white/60 lg:block">
            Your private collection, on your own server. Nobody else holds the key.
          </p>
        </div>
      </CinemaPanel>

      {/* The form: a plain, solid panel, so the poster does the talking. */}
      <main className="flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-16">
        {recovering ? (
          <RecoverForm authenticator={authenticator} onBack={() => setRecovering(false)} onSuccess={onSuccess} />
        ) : (
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-sm animate-fade-in space-y-7">
          <div className="space-y-1.5">
            <h1 className="text-3xl font-semibold tracking-tight">
              {isSetup ? "Create your account" : "Welcome back"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isSetup
                ? "This is the only account — it's created once and the setup page then closes for good."
                : "Sign in to your library."}
            </p>
          </div>

          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className={labelClass}>Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                className={inputClass}
              />
            </label>
            {/* A div, not a label around everything: "Forgot password?" must
                not become part of the field's name. */}
            <div className="space-y-1.5">
              <span className="flex items-baseline justify-between">
                <label htmlFor="auth-password" className={labelClass}>
                  Password
                </label>
                {!isSetup && (
                  <button
                    type="button"
                    onClick={() => setRecovering(true)}
                    className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </span>
              <span className="relative block">
                <input
                  id="auth-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete={isSetup ? "new-password" : "current-password"}
                  className={cn(inputClass, "pr-11")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </span>
            </div>
            {isSetup && (
              <label className="block space-y-1.5">
                <span className={labelClass}>Confirm password</span>
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </label>
            )}
          </div>

          {isSetup && !error && (
            <p className="text-xs text-muted-foreground">
              {password.length > 0 && password.length < MIN_PASSWORD_LENGTH
                ? `${MIN_PASSWORD_LENGTH - password.length} more character${
                    MIN_PASSWORD_LENGTH - password.length === 1 ? "" : "s"
                  } needed`
                : confirm.length > 0 && password !== confirm
                  ? "Passwords don’t match yet"
                  : `At least ${MIN_PASSWORD_LENGTH} characters, and confirm it below.`}
            </p>
          )}

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="space-y-4">
            <button
              type="submit"
              disabled={submit.isPending || passkey.isPending || !username || !password || (isSetup && !confirm)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-white px-4 font-semibold text-black transition-colors hover:bg-white/90 disabled:opacity-50"
            >
              {submit.isPending && <Loader2 className="size-4 animate-spin" />}
              {isSetup ? "Create account" : "Sign in"}
            </button>

            {!isSetup && (
              <button
                type="button"
                disabled={submit.isPending || passkey.isPending}
                onClick={() => {
                  setLocalError(null);
                  submit.reset();
                  passkey.mutate();
                }}
                className="group flex w-full items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                {passkey.isPending ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
                Use a passkey instead
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        </form>
        )}

        <p className="mx-auto mt-16 flex w-full max-w-sm items-center gap-1.5 text-[11px] text-muted-foreground/60">
          <Lock className="size-3" />
          Private server · your library never leaves it
        </p>
      </main>
    </div>
  );
}

const labelClass = "text-xs font-medium text-muted-foreground";

const inputClass =
  "h-12 w-full rounded-md border border-border bg-secondary/60 px-3.5 text-[15px] outline-none transition-colors focus:border-foreground/40 focus:bg-secondary autofill:shadow-[inset_0_0_0_1000px_var(--secondary)] autofill:[-webkit-text-fill-color:var(--foreground)]";

/**
 * "Forgot password?": no email to send, so the proof is a code from the
 * authenticator app set up in Settings, or one the server writes where only
 * whoever runs the machine can read it. Either ends in a new password and
 * signs you straight in.
 */
function RecoverForm({
  authenticator,
  onBack,
  onSuccess,
}: {
  authenticator: boolean;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [method, setMethod] = useState<"authenticator" | "server">(authenticator ? "authenticator" : "server");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const ask = useMutation({ mutationFn: requestServerResetCode });
  const reset = useMutation({
    mutationFn: () => recoverPassword(method, code, password),
    onSuccess,
  });

  function choose(next: "authenticator" | "server") {
    setMethod(next);
    setCode("");
    setLocalError(null);
    reset.reset();
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setLocalError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setLocalError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirm) {
      setLocalError("Passwords don’t match");
      return;
    }
    reset.mutate();
  }

  const codeReady = method === "authenticator" ? code.length === 6 : code.replace(/[^A-Z0-9]/gi, "").length === 8;
  const askedForCode = method === "server" && ask.isSuccess;
  const error =
    localError ??
    (reset.error instanceof Error ? reset.error.message : null) ??
    (ask.error instanceof Error ? ask.error.message : null);

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-sm animate-fade-in space-y-7">
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 mb-3 flex items-center gap-1 rounded px-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to sign in
        </button>
        <h1 className="text-3xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          There's no email to send, so prove it's you with a code instead.
        </p>
      </div>

      {authenticator && (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary/60 p-1" role="tablist">
          {RECOVERY_METHODS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={method === value}
              onClick={() => choose(value)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition-colors",
                method === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}

      {method === "server" && (
        <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4 text-sm">
          {askedForCode ? (
            <>
              <p className="flex items-center gap-1.5 font-medium">
                <Check className="size-4 text-emerald-500" />
                A code was written to the server
              </p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                On the computer running Arc Light, open <code className={codeClass}>backups/password-reset.txt</code>, or
                look for <code className={codeClass}>PASSWORD RESET CODE</code> in the server log (
                <code className={codeClass}>docker compose logs app</code>). It works once, for 15 minutes.
              </p>
              <button
                type="button"
                onClick={() => ask.mutate()}
                disabled={ask.isPending}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Send a new code
              </button>
            </>
          ) : (
            <>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                The server can write a one-time code where only someone at the machine it runs on can read it — its
                log, and a file in its backups folder.
              </p>
              <button
                type="button"
                onClick={() => ask.mutate()}
                disabled={ask.isPending}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
              >
                {ask.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Server className="size-3.5" />}
                Get a reset code
              </button>
            </>
          )}
        </div>
      )}

      {(method === "authenticator" || askedForCode) && (
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className={labelClass}>
              {method === "authenticator" ? "Code from your authenticator app" : "Reset code"}
            </span>
            <input
              value={code}
              onChange={(e) =>
                setCode(
                  method === "authenticator"
                    ? e.target.value.replace(/\D/g, "").slice(0, 6)
                    : e.target.value.toUpperCase().slice(0, 9),
                )
              }
              inputMode={method === "authenticator" ? "numeric" : "text"}
              autoComplete="one-time-code"
              autoFocus
              placeholder={method === "authenticator" ? "123456" : "XXXX-XXXX"}
              className={cn(inputClass, "font-mono tracking-[0.25em]")}
            />
          </label>
          <label className="block space-y-1.5">
            <span className={labelClass}>New password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block space-y-1.5">
            <span className={labelClass}>Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      )}

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {(method === "authenticator" || askedForCode) && (
        <button
          type="submit"
          disabled={!codeReady || !password || !confirm || reset.isPending}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-white px-4 font-semibold text-black transition-colors hover:bg-white/90 disabled:opacity-50"
        >
          {reset.isPending && <Loader2 className="size-4 animate-spin" />}
          Reset password and sign in
        </button>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground/70">
        Resetting signs out every other device.
        {!authenticator && " An authenticator app, set up in Settings › Personal, makes this quicker next time."}
      </p>
    </form>
  );
}

const RECOVERY_METHODS = [
  { value: "authenticator", label: "Authenticator app", icon: Smartphone },
  { value: "server", label: "Code from the server", icon: Server },
] as const;

const codeClass = "rounded bg-secondary px-1 py-px font-mono text-[12px] text-foreground";
