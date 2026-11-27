// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { and, desc, eq, getTableColumns, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { activityEvents, mediaItems } from "../db/schema.js";

export type ActivityType =
  | "scan"
  | "backup"
  | "metadata"
  | "collection"
  | "privacy"
  | "cache"
  | "library"
  | "watch"
  | "add"
  | "edit"
  | "tag"
  | "performer"
  | "hide"
  | "vault"
  // Added with "record everything":
  | "o"
  | "bookmark"
  | "note"
  | "inbox"
  | "follow"
  | "account"
  | "profile"
  | "settings"
  | "achievement";

export async function logActivity(
  type: ActivityType,
  message: string,
  metadata?: Record<string, unknown>,
  mediaItemId?: number,
): Promise<void> {
  try {
    await db
      .insert(activityEvents)
      .values({ type, message, metadata: metadata ?? null, mediaItemId: mediaItemId ?? null });
  } catch {
    // Activity is observability, never a reason to fail the operation being observed.
  }
}

/**
 * Events about items the reader has hidden are left out unless their vault
 * is open, so the log doesn't name what the vault is there to conceal.
 */
export async function listActivity(limit = 100, type?: string, hiddenFor: number | null = null) {
  const conditions: SQL[] = [];
  // One type, or several comma-separated: the page's filters are groups.
  const types = (type ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  if (types.length === 1) conditions.push(eq(activityEvents.type, types[0]));
  else if (types.length > 1) conditions.push(inArray(activityEvents.type, types));
  // `hiddenFor` is the profile whose vault to respect (the reader's), or
  // null when that vault is open.
  if (hiddenFor !== null) {
    conditions.push(
      sql`not exists (select 1 from profile_item_state pis where pis.profile_id = ${hiddenFor} and pis.media_item_id = ${activityEvents.mediaItemId} and pis.hidden_at is not null)`,
    );
  }
  return db
    // The item's thumbnail version too, so the log can show the picture
    // under the same cache key as everywhere else.
    .select({ ...getTableColumns(activityEvents), thumbnailFile: mediaItems.thumbnailFile })
    .from(activityEvents)
    .leftJoin(mediaItems, eq(mediaItems.id, activityEvents.mediaItemId))
    .where(and(...conditions))
    .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
    // A limit parsed from a query string can be NaN, which Postgres rejects
    // outright; fall back to the default rather than failing the request.
    .limit(Number.isFinite(limit) ? Math.min(500, Math.max(1, Math.floor(limit))) : 100);
}
