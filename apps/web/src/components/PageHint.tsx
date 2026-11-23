// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { Lightbulb, X } from "lucide-react";
import { useState } from "react";
import { pkey } from "@/lib/profileStorage";

const KEY = "dismissed-hints";

function readDismissed(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(pkey(KEY)) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * One line of help the first time you land on a page, gone for good once
 * dismissed. The page explains itself once, instead of every feature asking
 * for attention every visit. Per profile, per device.
 */
export function PageHint({ id, children }: { id: string; children: React.ReactNode }) {
  const [hidden, setHidden] = useState(() => readDismissed().includes(id));
  if (hidden) return null;

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(pkey(KEY), JSON.stringify([...readDismissed(), id]));
    } catch {
      // Storage blocked: it just comes back next visit.
    }
  }

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-muted-foreground">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
      <p className="flex-1">{children}</p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Got it"
        title="Got it"
        className="-m-1 rounded p-1 transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
