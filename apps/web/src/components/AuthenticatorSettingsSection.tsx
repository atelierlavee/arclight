// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import {
  confirmAuthenticator,
  fetchAuthenticator,
  startAuthenticatorSetup,
  turnOffAuthenticator,
} from "@/lib/authApi";
import { qk } from "@/lib/queryKeys";
import { QrCode } from "./QrCode";
import { SettingsSection, settingsInputClass } from "./SettingsSection";

type Step = { kind: "idle" } | { kind: "password" } | { kind: "scan"; secret: string; uri: string } | { kind: "off" };

const primary =
  "inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50";
const quiet =
  "inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-50";

/**
 * An authenticator app as the way back in when the password is forgotten:
 * the six digits it shows reset the password from the sign-in screen, with
 * no email involved. Your password, every time it is set up or switched off
 * — it can reset the password, so it must not be added by someone at an
 * unlocked browser.
 */
export function AuthenticatorSettingsSection() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: qk.authenticator, queryFn: fetchAuthenticator });
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.authenticator });
    // The sign-in screen reads whether one is set up from the auth status.
    void queryClient.invalidateQueries({ queryKey: qk.authStatus });
  };
  const reset = () => {
    setStep({ kind: "idle" });
    setPassword("");
    setCode("");
  };

  const start = useMutation({
    mutationFn: () => startAuthenticatorSetup(password),
    onSuccess: ({ secret, uri }) => {
      setPassword("");
      setStep({ kind: "scan", secret, uri });
    },
  });
  const confirm = useMutation({
    mutationFn: () => confirmAuthenticator(code),
    onSuccess: () => {
      reset();
      refresh();
    },
  });
  const off = useMutation({
    mutationFn: () => turnOffAuthenticator(password),
    onSuccess: () => {
      reset();
      refresh();
    },
  });

  const enabled = data?.enabled ?? false;
  const error = start.error ?? confirm.error ?? off.error;

  return (
    <SettingsSection
      title="Authenticator app"
      description="If you forget your password, a code from an app like Google Authenticator, Authy or 1Password resets it from the sign-in screen. No email needed."
    >
      <p
        className={
          enabled
            ? "flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-[13px] text-emerald-300/90"
            : "flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-[13px] text-muted-foreground"
        }
      >
        {enabled ? <ShieldCheck className="size-4 shrink-0" /> : <Smartphone className="size-4 shrink-0" />}
        {enabled
          ? "On. “Forgot password?” on the sign-in screen accepts a code from your app."
          : "Not set up. Without it, a forgotten password needs a reset code read from the server machine."}
      </p>

      {step.kind === "idle" && (
        <div className="flex flex-wrap gap-2">
          {enabled ? (
            <>
              <button type="button" onClick={() => setStep({ kind: "password" })} className={quiet}>
                Move to a new phone
              </button>
              <button
                type="button"
                onClick={() => setStep({ kind: "off" })}
                className={`${quiet} hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive`}
              >
                Turn off
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setStep({ kind: "password" })} className={primary}>
              <Smartphone className="size-4" />
              Set up an authenticator
            </button>
          )}
        </div>
      )}

      {(step.kind === "password" || step.kind === "off") && (
        <form
          className="space-y-3 rounded-lg border border-border bg-card/30 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!password) return;
            if (step.kind === "off") off.mutate();
            else start.mutate();
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">Your password</span>
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={settingsInputClass}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!password || start.isPending || off.isPending}
              className={step.kind === "off" ? `${primary} bg-destructive text-white` : primary}
            >
              {(start.isPending || off.isPending) && <Loader2 className="size-3.5 animate-spin" />}
              {step.kind === "off" ? "Turn off" : "Continue"}
            </button>
            <button type="button" onClick={reset} className="px-2 text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </form>
      )}

      {step.kind === "scan" && (
        <div className="space-y-4 rounded-lg border border-border bg-card/30 p-4">
          <ol className="space-y-1 text-[13px] text-muted-foreground">
            <li>1. In your authenticator app, add an account and scan this code.</li>
            <li>2. Type the six digits it shows to finish.</li>
          </ol>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="rounded-lg bg-white p-2">
              <QrCode value={step.uri} size={160} label="Authenticator setup code" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <span className="text-xs text-muted-foreground">Can't scan? Enter this key instead:</span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(step.secret);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }}
                className="flex max-w-full items-center gap-2 rounded-md border border-border bg-secondary/40 px-2.5 py-1.5 font-mono text-xs tracking-wider transition-colors hover:bg-secondary"
              >
                <span className="truncate">{step.secret.match(/.{1,4}/g)?.join(" ")}</span>
                {copied ? <Check className="size-3.5 shrink-0 text-emerald-500" /> : <Copy className="size-3.5 shrink-0" />}
              </button>
            </div>
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (code.length === 6) confirm.mutate();
            }}
          >
            <label className="block space-y-1.5">
              <span className="text-xs font-medium">Code from the app</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className={`${settingsInputClass} w-36 font-mono text-base tracking-[0.3em]`}
              />
            </label>
            <button type="submit" disabled={code.length !== 6 || confirm.isPending} className={primary}>
              {confirm.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Turn on
            </button>
            <button type="button" onClick={reset} className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </form>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error.message}</p>}
    </SettingsSection>
  );
}
