// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { db } from "../db/client.js";
import { bookmarks, mediaItems } from "../db/schema.js";
import { hiddenGate, itemReachable } from "../library/visibility.js";
import { profileId } from "../auth/profileContext.js";
import { logActivity } from "../activity/log.js";

const MAX_LABEL_LENGTH = 200;
const MAX_NOTE_LENGTH = 4000;
/**
 * The most one video's list returns. Far past anything placed by hand —
 * they are ticks on a seek bar — but a ceiling all the same, so a script
 * that adds bookmarks in a loop cannot make every player open slower.
 */
const MAX_BOOKMARKS = 500;

/** Trims, and turns an empty label into no label rather than "". */
function cleanLabel(label: string | null | undefined): string | null {
  const trimmed = label?.trim().slice(0, MAX_LABEL_LENGTH);
  return trimmed ? trimmed : null;
}

function cleanNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim().slice(0, MAX_NOTE_LENGTH);
  return trimmed ? trimmed : null;
}

/** 754 → "12:34", 3754 → "1:02:34": how the player shows a position. */
function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "12:34 · Intro", or just "12:34" for an unlabelled bookmark. */
function bookmarkDetail(positionSeconds: number, label: string | null): string {
  return label ? `${clock(positionSeconds)} · ${label}` : clock(positionSeconds);
}

async function itemTitle(id: number): Promise<string> {
  const [row] = await db.select({ title: mediaItems.title }).from(mediaItems).where(eq(mediaItems.id, id));
  return row?.title ?? "Untitled";
}

const columns = {
  id: bookmarks.id,
  mediaItemId: bookmarks.mediaItemId,
  positionSeconds: bookmarks.positionSeconds,
  label: bookmarks.label,
  note: bookmarks.note,
  createdAt: bookmarks.createdAt,
};

/**
 * Moments marked inside a video.
 *
 * Listed in playback order rather than the order they were made: they are
 * drawn as ticks along the seek bar and read as a table of contents, and both
 * of those run left to right through the video.
 */
export async function bookmarkRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/api/media-items/:id/bookmarks", async (request, reply) => {
    const id = Number(request.params.id);
    // A vault item's bookmarks are labelled moments in it — as revealing as
    // the item — so they 404 the same way its detail does.
    if (!(await itemReachable(request, id))) {
      reply.code(404);
      return { error: "Not found" };
    }
    const rows = await db
      .select(columns)
      .from(bookmarks)
      .where(and(eq(bookmarks.mediaItemId, id), eq(bookmarks.profileId, profileId(request))))
      .orderBy(asc(bookmarks.positionSeconds), asc(bookmarks.id))
      .limit(MAX_BOOKMARKS);
    return { bookmarks: rows };
  });

  app.post<{
    Params: { id: string };
    Body: { positionSeconds: number; label?: string | null; note?: string | null };
  }>("/api/media-items/:id/bookmarks", async (request, reply) => {
    const id = Number(request.params.id);
    const { positionSeconds, label, note } = request.body ?? {};

    if (typeof positionSeconds !== "number" || !Number.isFinite(positionSeconds) || positionSeconds < 0) {
      reply.code(400);
      return { error: "positionSeconds must be a number of seconds, 0 or more" };
    }
    if ((label != null && typeof label !== "string") || (note != null && typeof note !== "string")) {
      reply.code(400);
      return { error: "label and note must be strings" };
    }

    const [item] = await db
      .select({ durationSeconds: mediaItems.durationSeconds, title: mediaItems.title })
      .from(mediaItems)
      .where(and(eq(mediaItems.id, id), hiddenGate(request)));
    if (!item) {
      reply.code(404);
      return { error: "Not found" };
    }

    // Clamped to the video's length where it is known. The player reports
    // currentTime a fraction past the end on the final frame, and a tick
    // drawn past 100% of the bar would hang off its end.
    const whole = Math.floor(positionSeconds);
    const position =
      item.durationSeconds != null ? Math.min(whole, item.durationSeconds) : whole;

    const [created] = await db
      .insert(bookmarks)
      .values({
        profileId: profileId(request),
        mediaItemId: id,
        positionSeconds: position,
        label: cleanLabel(label),
        note: cleanNote(note),
      })
      .returning(columns);

    // Bookmarks are per profile: only the owner's own land in the log.
    if (request.profile?.isOwner) await logActivity(
      "bookmark",
      `Bookmark added to "${item.title}": ${bookmarkDetail(created.positionSeconds, created.label)}`,
      { bookmarkId: created.id, positionSeconds: created.positionSeconds, label: created.label },
      id,
    );

    reply.code(201);
    return created;
  });

  app.patch<{
    Params: { id: string };
    Body: { label?: string | null; note?: string | null };
  }>(
    "/api/bookmarks/:id",
    async (request, reply) => {
      const id = Number(request.params.id);
      const body = request.body ?? {};
      const update: { label?: string | null; note?: string | null } = {};
      if ("label" in body) {
        if (body.label != null && typeof body.label !== "string") {
          reply.code(400);
          return { error: "label must be a string" };
        }
        update.label = cleanLabel(body.label);
      }
      if ("note" in body) {
        if (body.note != null && typeof body.note !== "string") {
          reply.code(400);
          return { error: "note must be a string" };
        }
        update.note = cleanNote(body.note);
      }
      if (Object.keys(update).length === 0) {
        reply.code(400);
        return { error: "Provide a label or note to update" };
      }

      if (!(await bookmarkReachable(request, id))) {
        reply.code(404);
        return { error: "Not found" };
      }
      const [updated] = await db
        .update(bookmarks)
        .set(update)
        .where(and(eq(bookmarks.id, id), eq(bookmarks.profileId, profileId(request))))
        .returning(columns);
      if (!updated) {
        reply.code(404);
        return { error: "Not found" };
      }
      if (request.profile?.isOwner) {
        const changed = [
          ...("label" in update ? [update.label ? "renamed" : "label cleared"] : []),
          ...("note" in update ? [update.note ? "note updated" : "note cleared"] : []),
        ];
        await logActivity(
          "bookmark",
          `Bookmark on "${await itemTitle(updated.mediaItemId)}" updated: ${bookmarkDetail(updated.positionSeconds, updated.label)}`,
          { bookmarkId: updated.id, positionSeconds: updated.positionSeconds, label: updated.label, changes: changed },
          updated.mediaItemId,
        );
      }
      return updated;
    }
  );

  app.delete<{ Params: { id: string } }>("/api/bookmarks/:id", async (request, reply) => {
    const id = Number(request.params.id);
    if (!(await bookmarkReachable(request, id))) {
      reply.code(404);
      return { error: "Not found" };
    }
    const deleted = await db
      .delete(bookmarks)
      .where(and(eq(bookmarks.id, id), eq(bookmarks.profileId, profileId(request))))
      .returning({
        id: bookmarks.id,
        mediaItemId: bookmarks.mediaItemId,
        positionSeconds: bookmarks.positionSeconds,
        label: bookmarks.label,
      });
    if (deleted.length === 0) {
      reply.code(404);
      return { error: "Not found" };
    }
    if (request.profile?.isOwner) {
      const [gone] = deleted;
      await logActivity(
        "bookmark",
        `Bookmark removed from "${await itemTitle(gone.mediaItemId)}": ${bookmarkDetail(gone.positionSeconds, gone.label)}`,
        { bookmarkId: gone.id, positionSeconds: gone.positionSeconds, label: gone.label },
        gone.mediaItemId,
      );
    }
    return { ok: true };
  });
}

// Bookmarks are addressed by their own id, so the item they belong to has to
// be looked up before the vault rule can apply — otherwise a hidden item's
// bookmarks could be edited or deleted by enumerating bookmark ids. Another
// profile's bookmark is "not found" the same way.
async function bookmarkReachable(request: FastifyRequest, id: number): Promise<boolean> {
  if (!Number.isInteger(id)) return false;
  const [row] = await db
    .select({ mediaItemId: bookmarks.mediaItemId })
    .from(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.profileId, profileId(request))));
  return row ? itemReachable(request, row.mediaItemId) : false;
}
