// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { thumbnailUrl } from "./mediaItemApi";
import type { CoPerformer, YearGroup } from "./performerApi";

export type StudioSummary = {
  id: number;
  name: string;
  /** The network this studio is a site of, if any. */
  parentId: number | null;
  /** Including every site under it: a network's card shows the network. */
  videoCount: number;
  /** Followed by the current profile. */
  isFollowed?: boolean;
  representativeItemId: number | null;
  /**
   * A few recent frames, newest first, for callers that would rather show a
   * different one each time than the same still forever. Empty for a studio
   * with no videos.
   */
  frameItemIds: number[];
  /**
   * Each frame's thumbnail version, by video id, so its image URL changes
   * when the thumbnail is replaced. Optional so older payloads still parse.
   */
  thumbnailFiles?: Record<string, string | null>;
};

/**
 * One of a studio's frames, picked at random — the server already samples
 * them at random from every video it has, so a cover is never the same
 * still forever and takes in new videos as the studio grows.
 */
export function randomStudioFrame(studio: Pick<StudioSummary, "frameItemIds" | "representativeItemId">): number | null {
  const frames = studio.frameItemIds;
  if (frames.length === 0) return studio.representativeItemId;
  return frames[Math.floor(Math.random() * frames.length)];
}

/**
 * A studio frame's image URL, versioned by its thumbnail so a replaced
 * thumbnail shows at once instead of the year-cached old one.
 */
export function studioFrameUrl(studio: Pick<StudioSummary, "thumbnailFiles">, id: number): string {
  return thumbnailUrl({ id, thumbnailFile: studio.thumbnailFiles?.[id] ?? null });
}

/**
 * A performer credited on this studio's videos.
 *
 * The same shape a co-performer has — `together` counts videos *for this
 * studio*, while `videoCount` is their own catalogue — so the existing
 * portrait tile renders it without a second variant.
 */
export type StudioPerformer = CoPerformer;

export type StudioRef = { id: number; name: string };

export type StudioDetail = {
  id: number;
  name: string;
  /** "user" for one made by hand, which is usually a network. */
  origin: "scanner" | "user";
  /** The home tile its videos are filed under; null defers to its network. */
  defaultCategoryId: number | null;
  parent: StudioRef | null;
  /** Its direct sites. */
  sites: StudioRef[];
  /** Every figure here covers the studio and all its sites. */
  videoCount: number;
  totalDurationSeconds: number;
  albumCount: number;
  years: YearGroup[];
  watch: { watched: number; inProgress: number; unwatched: number };
  performers: StudioPerformer[];
  representativeItemId: number | null;
  bannerItemId: number | null;
  /** When the current profile followed it, or null. */
  followedAt: string | null;
};

export async function fetchStudios(): Promise<{ studios: StudioSummary[] }> {
  const res = await fetch("/api/studios");
  if (!res.ok) throw new Error(`Failed to load studios: ${res.status}`);
  return res.json();
}

export async function fetchStudio(id: number): Promise<StudioDetail> {
  const res = await fetch(`/api/studios/${id}`);
  if (!res.ok) throw new Error(`Failed to load studio: ${res.status}`);
  return res.json();
}

async function send(url: string, method: string, body: unknown): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `Request failed: ${res.status}`);
  }
  return res;
}

/** Makes a studio by hand — in practice a network to put sites under. */
export async function setStudioFollowed(id: number, follow: boolean): Promise<void> {
  const res = await fetch(`/api/studios/${id}/follow`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ follow }),
  });
  if (!res.ok) throw new Error(`Failed to update following: ${res.status}`);
}

export async function createStudio(name: string): Promise<StudioRef> {
  const res = await send("/api/studios", "POST", { name });
  return (await res.json()).studio;
}

/**
 * Sets the network a studio belongs to (null takes it out of one) and the
 * home tile its videos are filed under (null defers to the network).
 */
export async function saveStudio(
  id: number,
  patch: { parentId?: number | null; defaultCategoryId?: number | null },
): Promise<void> {
  await send(`/api/studios/${id}`, "PATCH", patch);
}
