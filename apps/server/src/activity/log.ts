import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { activityEvents } from "../db/schema.js";

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
  | "vault";

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
  if (type) conditions.push(eq(activityEvents.type, type));
  // `hiddenFor` is the profile whose vault to respect (the reader's), or
  // null when that vault is open.
  if (hiddenFor !== null) {
    conditions.push(
      sql`not exists (select 1 from profile_item_state pis where pis.profile_id = ${hiddenFor} and pis.media_item_id = ${activityEvents.mediaItemId} and pis.hidden_at is not null)`,
    );
  }
  return db
    .select()
    .from(activityEvents)
    .where(and(...conditions))
    .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
    // A limit parsed from a query string can be NaN, which Postgres rejects
    // outright; fall back to the default rather than failing the request.
    .limit(Number.isFinite(limit) ? Math.min(500, Math.max(1, Math.floor(limit))) : 100);
}
