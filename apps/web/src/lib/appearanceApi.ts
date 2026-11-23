// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import type { Appearance } from "./appearance";

/** The server stores a partial: only what's been changed from the defaults. */
export type StoredAppearance = Partial<Appearance>;

export async function fetchAppearance(): Promise<StoredAppearance> {
  const res = await fetch("/api/appearance");
  if (!res.ok) throw new Error(`Failed to load appearance: ${res.status}`);
  const body = (await res.json()) as { appearance?: StoredAppearance } | null;
  // Defaulted rather than trusted. The provider merges this into state inside
  // a setState updater, so an undefined here throws during render — and React
  // unwinds to the outermost error boundary, which white-screens the whole
  // app over a display preference. A 200 with an unexpected shape is not
  // something the caller can do anything about either way.
  return body?.appearance ?? {};
}

export async function saveAppearance(patch: StoredAppearance): Promise<void> {
  const res = await fetch("/api/appearance", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to save appearance: ${res.status}`);
}
