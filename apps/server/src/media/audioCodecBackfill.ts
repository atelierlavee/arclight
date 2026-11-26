// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { mediaFiles, mediaItems } from "../db/schema.js";
import { probeVideo } from "../metadata/videoProbe.js";

/**
 * Whether a probed video is missing its audio codec.
 *
 * The audio codec was added to the probe after many libraries were already
 * scanned, and a scan only re-probes a file that changed. Those older videos
 * have their video codec and container on record but no audio codec, and the
 * playback check reads that gap as "unknown audio, transcode" — so ordinary
 * H.264 + AAC MP4s were being sent through ffmpeg. A missing `codec` means
 * the video was never probed at all, which is a different case left alone.
 */
export function needsAudioCodec(extraMetadata: unknown): boolean {
  if (!extraMetadata || typeof extraMetadata !== "object") return false;
  const meta = extraMetadata as Record<string, unknown>;
  return typeof meta.codec === "string" && meta.audioCodec === undefined;
}

/** How long a failed probe is trusted before trying the file again. */
const FAILURE_RETRY_MS = 10 * 60 * 1000;
const failedAt = new Map<number, number>();
const inFlight = new Map<number, Promise<Record<string, unknown> | null>>();

async function probeAndStore(itemId: number): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({ extraMetadata: mediaItems.extraMetadata, path: mediaFiles.path })
    .from(mediaItems)
    .innerJoin(mediaFiles, eq(mediaFiles.mediaItemId, mediaItems.id))
    .where(eq(mediaItems.id, itemId));
  if (!row) return null;
  const current = (row.extraMetadata as Record<string, unknown> | null) ?? {};
  if (!needsAudioCodec(current)) return current;

  const probe = await probeVideo(row.path);
  // A failed probe (drive offline, timeout, ffprobe missing) comes back all
  // null. Leave the record as it is: "unknown, transcode" stays the fallback.
  if (probe.codec === null && probe.durationSeconds === null) {
    failedAt.set(itemId, Date.now());
    return null;
  }

  const next = { ...current, audioCodec: probe.audioCodec };
  await db.update(mediaItems).set({ extraMetadata: next }).where(eq(mediaItems.id, itemId));
  failedAt.delete(itemId);
  return next;
}

/**
 * Probes a video for its audio codec and records it, once.
 *
 * Returns the item's updated metadata, or null when nothing changed — the
 * probe failed recently, or failed now. Concurrent calls for the same item
 * share one probe.
 */
export async function backfillAudioCodec(itemId: number): Promise<Record<string, unknown> | null> {
  const lastFailure = failedAt.get(itemId);
  if (lastFailure !== undefined && Date.now() - lastFailure < FAILURE_RETRY_MS) return null;

  const pending = inFlight.get(itemId);
  if (pending) return pending;
  const work = probeAndStore(itemId).finally(() => inFlight.delete(itemId));
  inFlight.set(itemId, work);
  return work;
}

/** Forgets recent failures. For tests, whose reset database reuses item ids. */
export function resetAudioCodecBackfill(): void {
  failedAt.clear();
  inFlight.clear();
}
