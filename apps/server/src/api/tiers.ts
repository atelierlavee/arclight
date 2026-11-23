// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { mediaItems, performers, profileItemState, profilePerformerState } from "../db/schema.js";
import { profileId } from "../auth/profileContext.js";
import { hiddenGate, visibleItemsSql } from "../library/visibility.js";
import { itemNotHidden } from "../library/profileState.js";

/** Best first. */
export const TIERS = ["S", "A", "B", "C", "D"] as const;
export type Tier = (typeof TIERS)[number];
const KINDS = ["performer", "video"] as const;
type Kind = (typeof KINDS)[number];

/** More than this on one board is not a ranking any more. */
const MAX_RANKED = 2000;
/** How many unranked videos the pool offers; the rest are found by search. */
const VIDEO_POOL_LIMIT = 200;

type Board = Record<Tier, number[]>;

/** Reads `{ S: [ids], A: [...], ... }`, every id whole and on the board once. */
export function parseBoard(value: unknown): { ok: true; board: Board } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "tiers must be an object of tier → ids" };
  }
  const board = Object.fromEntries(TIERS.map((tier) => [tier, [] as number[]])) as Board;
  const seen = new Set<number>();
  for (const [key, ids] of Object.entries(value)) {
    if (!(TIERS as readonly string[]).includes(key)) return { ok: false, error: `unknown tier "${key}"` };
    if (!Array.isArray(ids)) return { ok: false, error: `tier ${key} must be a list of ids` };
    for (const id of ids) {
      if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "ids must be positive whole numbers" };
      if (seen.has(id)) return { ok: false, error: `id ${id} is in more than one place` };
      seen.add(id);
      board[key as Tier].push(id);
    }
  }
  if (seen.size > MAX_RANKED) return { ok: false, error: `at most ${MAX_RANKED} can be ranked` };
  return { ok: true, board };
}

/**
 * A personal tier list, per profile: performers or videos dragged into
 * S, A, B, C and D. Quicker than stars for saying what you think of
 * everyone relative to everyone else, and fun to keep up.
 *
 * The whole board is saved at once. Moving one tile changes two rows, and
 * saving rows one at a time would let a quick second drag interleave with
 * the first and lose a tile.
 */
export async function tierRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { kind: string } }>("/api/tiers/:kind", async (request, reply) => {
    const kind = request.params.kind as Kind;
    if (!KINDS.includes(kind)) {
      reply.code(404);
      return { error: "Not found" };
    }
    const profile = profileId(request);
    const visible = visibleItemsSql("mi", profile);
    const isVideo = sql`mi.item_type_id in (select id from media_item_types where name = 'video')`;

    if (kind === "performer") {
      const columns = sql`p.id, p.name, (p.image_file is not null) as "hasImage", (p.banner_file is not null) as "hasBanner",
        (select max(mi.id) from media_item_performers mip join media_items mi on mi.id = mip.media_item_id
          where mip.performer_id = p.id and ${visible} and ${isVideo}) as "representativeItemId"`;
      const ranked = await db.execute(sql`
        select ${columns}, pps.tier
        from profile_performer_state pps
        join performers p on p.id = pps.performer_id
        where pps.profile_id = ${profile} and pps.tier is not null
        order by pps.tier, pps.tier_position, lower(p.name)
      `);
      // Everyone else with something to watch, favourites first.
      const pool = await db.execute(sql`
        select ${columns}
        from performers p
        left join profile_performer_state pps on pps.performer_id = p.id and pps.profile_id = ${profile}
        where p.archived_at is null and pps.tier is null
          and exists (
            select 1 from media_item_performers mip join media_items mi on mi.id = mip.media_item_id
            where mip.performer_id = p.id and ${visible} and ${isVideo}
          )
        order by coalesce(pps.is_favorite, false) desc, lower(p.name)
      `);
      return { kind, tiers: TIERS, ranked: ranked.rows, pool: pool.rows };
    }

    const columns = sql`mi.id, mi.title, mi.thumbnail_file as "thumbnailFile", mi.duration_seconds as "durationSeconds"`;
    const ranked = await db.execute(sql`
      select ${columns}, pis.tier
      from profile_item_state pis
      join media_items mi on mi.id = pis.media_item_id
      where pis.profile_id = ${profile} and pis.tier is not null and ${visible} and ${isVideo}
      order by pis.tier, pis.tier_position, mi.id
    `);
    // What this profile has a view on — watched, favourited or rated — most
    // recently played first. Anything else is a search away.
    const pool = await db.execute(sql`
      select ${columns}
      from media_items mi
      left join profile_item_state pis on pis.media_item_id = mi.id and pis.profile_id = ${profile}
      left join playback_states ps on ps.media_item_id = mi.id and ps.profile_id = ${profile}
      where ${visible} and ${isVideo} and pis.tier is null
        and (ps.id is not null or pis.is_favorite or pis.rating is not null)
      order by ps.updated_at desc nulls last, mi.id desc
      limit ${VIDEO_POOL_LIMIT}
    `);
    return { kind, tiers: TIERS, ranked: ranked.rows, pool: pool.rows };
  });

  app.put<{ Params: { kind: string }; Body: { tiers: unknown } }>("/api/tiers/:kind", async (request, reply) => {
    const kind = request.params.kind as Kind;
    if (!KINDS.includes(kind)) {
      reply.code(404);
      return { error: "Not found" };
    }
    const parsed = parseBoard((request.body as { tiers?: unknown } | undefined)?.tiers);
    if (!parsed.ok) {
      reply.code(400);
      return { error: parsed.error };
    }
    const profile = profileId(request);
    const listed = TIERS.flatMap((tier) => parsed.board[tier]);

    // Unknown ids are dropped rather than failing the save: a performer
    // deleted in another tab should not cost you the rest of the board.
    // A vault item is unknown too while the vault is locked.
    const known = new Set(
      listed.length === 0
        ? []
        : kind === "performer"
          ? (await db.select({ id: performers.id }).from(performers).where(inArray(performers.id, listed))).map(
              (row) => row.id,
            )
          : (
              await db
                .select({ id: mediaItems.id })
                .from(mediaItems)
                .where(and(inArray(mediaItems.id, listed), hiddenGate(request)))
            ).map((row) => row.id),
    );

    await db.transaction(async (tx) => {
      if (kind === "performer") {
        await tx
          .update(profilePerformerState)
          .set({ tier: null, tierPosition: null })
          .where(
            and(
              eq(profilePerformerState.profileId, profile),
              isNotNull(profilePerformerState.tier),
              listed.length ? notInArray(profilePerformerState.performerId, listed) : undefined,
            ),
          );
      } else {
        // Vault items keep their place: they were never on the board sent,
        // because the board never showed them.
        await tx
          .update(profileItemState)
          .set({ tier: null, tierPosition: null })
          .where(
            and(
              eq(profileItemState.profileId, profile),
              isNotNull(profileItemState.tier),
              itemNotHidden(profile, profileItemState.mediaItemId),
              listed.length ? notInArray(profileItemState.mediaItemId, listed) : undefined,
            ),
          );
      }

      for (const tier of TIERS) {
        let position = 0;
        for (const id of parsed.board[tier]) {
          if (!known.has(id)) continue;
          const values = { tier, tierPosition: position++ };
          if (kind === "performer") {
            await tx
              .insert(profilePerformerState)
              .values({ profileId: profile, performerId: id, ...values })
              .onConflictDoUpdate({
                target: [profilePerformerState.profileId, profilePerformerState.performerId],
                set: values,
              });
          } else {
            await tx
              .insert(profileItemState)
              .values({ profileId: profile, mediaItemId: id, ...values })
              .onConflictDoUpdate({
                target: [profileItemState.profileId, profileItemState.mediaItemId],
                set: values,
              });
          }
        }
      }
    });

    return { ok: true, ranked: [...known].length };
  });
}
