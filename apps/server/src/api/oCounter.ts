// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { serialized } from "../auth/serialize.js";
import { db } from "../db/client.js";
import { mediaItems, oEvents, profileItemState } from "../db/schema.js";
import { profileId } from "../auth/profileContext.js";
import { hiddenGate } from "../library/visibility.js";
import { parseId } from "./mediaItemQueries.js";

/**
 * The O-counter: a per-profile tally on an item, with each count kept as an
 * event so stats can ask when, not only how often.
 *
 * The tally (profile_item_state.o_count) and the events (o_events) are only
 * ever changed together, in one transaction, so the number a grid shows and
 * the history behind it cannot disagree. Per profile, like favourites and
 * watch history: one person's count is nobody else's business.
 */
export async function oCounterRoutes(app: FastifyInstance): Promise<void> {
  /** The item, answered 404 for anything a locked vault hides. */
  async function reachable(request: Parameters<typeof hiddenGate>[0], rawId: string) {
    const id = parseId(rawId);
    if (id === null) return null;
    const [item] = await db
      .select({ id: mediaItems.id })
      .from(mediaItems)
      .where(and(eq(mediaItems.id, id), eq(mediaItems.inScope, true), hiddenGate(request)));
    return item?.id ?? null;
  }

  app.post<{ Params: { id: string } }>("/api/media-items/:id/o", async (request, reply) => {
    const id = await reachable(request, request.params.id);
    if (id === null) {
      reply.code(404);
      return { error: "Not found" };
    }
    const profile = profileId(request);

    // Serialised per profile and item so a double-click is two counts, not a
    // lost update, and the undo below can never see half of one.
    return serialized(`o:${profile}:${id}`, async () => {
      const oCount = await db.transaction(async (tx) => {
        await tx.insert(oEvents).values({ profileId: profile, mediaItemId: id });
        const [state] = await tx
          .insert(profileItemState)
          .values({ profileId: profile, mediaItemId: id, oCount: 1 })
          .onConflictDoUpdate({
            target: [profileItemState.profileId, profileItemState.mediaItemId],
            set: { oCount: sql`${profileItemState.oCount} + 1` },
          })
          .returning({ oCount: profileItemState.oCount });
        return state.oCount;
      });
      return { oCount };
    });
  });

  /** Takes back the most recent count, for a mis-click. Never goes below zero. */
  app.delete<{ Params: { id: string } }>("/api/media-items/:id/o", async (request, reply) => {
    const id = await reachable(request, request.params.id);
    if (id === null) {
      reply.code(404);
      return { error: "Not found" };
    }
    const profile = profileId(request);

    return serialized(`o:${profile}:${id}`, async () => {
      const oCount = await db.transaction(async (tx) => {
        const [latest] = await tx
          .select({ id: oEvents.id })
          .from(oEvents)
          .where(and(eq(oEvents.profileId, profile), eq(oEvents.mediaItemId, id)))
          .orderBy(desc(oEvents.createdAt), desc(oEvents.id))
          .limit(1);
        if (latest) await tx.delete(oEvents).where(eq(oEvents.id, latest.id));

        const [state] = await tx
          .update(profileItemState)
          .set({ oCount: sql`greatest(${profileItemState.oCount} - ${latest ? 1 : 0}, 0)` })
          .where(and(eq(profileItemState.profileId, profile), eq(profileItemState.mediaItemId, id)))
          .returning({ oCount: profileItemState.oCount });
        return state?.oCount ?? 0;
      });
      return { oCount };
    });
  });
}
