// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import type { PerformerFacts, PerformerGender } from "./performerApi";

/** A StashDB match, shaped like the facts this app stores. */
export type StashDbPerformer = {
  id: string;
  name: string;
  disambiguation: string | null;
  url: string;
  gender: PerformerGender | null;
} & Omit<PerformerFacts, "gender">;

async function failure(res: Response, fallback: string): Promise<Error> {
  const detail = (await res.json().catch(() => null)) as { error?: string } | null;
  return new Error(detail?.error ?? `${fallback}: ${res.status}`);
}

export async function fetchStashDbStatus(): Promise<{ configured: boolean }> {
  const res = await fetch("/api/stashdb");
  if (!res.ok) throw await failure(res, "Failed to load StashDB status");
  return res.json();
}

export async function searchStashDbPerformers(name: string): Promise<StashDbPerformer[]> {
  const res = await fetch(`/api/stashdb/performers?q=${encodeURIComponent(name)}`);
  if (!res.ok) throw await failure(res, "StashDB lookup failed");
  return ((await res.json()) as { performers: StashDbPerformer[] }).performers;
}

/** A name from a scene match, and whether the library already has it. */
export type StashDbName = { name: string; inLibrary: boolean };

export type StashDbScene = {
  id: string;
  title: string | null;
  details: string | null;
  date: string | null;
  url: string;
  studio: StashDbName | null;
  performers: StashDbName[];
  tags: StashDbName[];
};

export async function searchStashDbScenes(title: string): Promise<StashDbScene[]> {
  const res = await fetch(`/api/stashdb/scenes?q=${encodeURIComponent(title)}`);
  if (!res.ok) throw await failure(res, "StashDB lookup failed");
  return ((await res.json()) as { scenes: StashDbScene[] }).scenes;
}
