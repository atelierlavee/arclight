import { eq, sql } from "drizzle-orm";
import { type FastifyInstance } from "fastify";
import { logActivity } from "../activity/log.js";
import { isVaultUnlocked, vaultPinConfigured } from "../auth/vaultUnlock.js";
import { profileId, unlockKey } from "../auth/profileContext.js";
import { setItemState } from "../library/profileState.js";
import { db } from "../db/client.js";
import { mediaItems, series } from "../db/schema.js";
import {
  categorySlugs,
  clampPercent,
  ensureStudioId,
  isId,
  isNonNegativeInt,
  parseId,
} from "./mediaItemQueries.js";

const isOptionalString = (value: unknown) =>
  value === undefined || value === null || typeof value === "string";

/**
 * Whether making `parentId` the parent of `id` would close a loop.
 *
 * Walks up from the proposed parent: if `id` is anywhere among its
 * ancestors, the item would end up inside itself and every folder view and
 * breadcrumb that follows parent links would never terminate. UNION rather
 * than UNION ALL, so a loop that somehow already exists stops the walk
 * instead of spinning it forever.
 */
async function wouldCreateCycle(id: number, parentId: number): Promise<boolean> {
  if (id === parentId) return true;
  const rows = await db.execute(sql`
    with recursive ancestors(id, parent_id) as (
      select id, parent_id from media_items where id = ${parentId}
      union
      select m.id, m.parent_id
      from media_items m
      join ancestors a on m.id = a.parent_id
    )
    select 1 from ancestors where id = ${id} limit 1
  `);
  return rows.rows.length > 0;
}

/**
 * The PATCH fields that are about the library rather than one person.
 * PATCH /api/media-items/:id is the one route that mixes both (see
 * auth/ownerRoutes.ts PROFILE_ROUTES), so a non-owner profile may send only
 * isFavorite and rating; any of these is 403 owner_only for them.
 */
export const OWNER_FIELDS = [
  "parentId",
  "title",
  "description",
  "kind",
  "studio",
  "thumbnailPositionX",
  "thumbnailPositionY",
  "thumbnailScale",
  "tileShape",
  "seriesId",
  "seasonNumber",
  "episodeNumber",
  "episodeTitle",
] as const;

export async function mediaItemEditRoutes(app: FastifyInstance): Promise<void> {
  app.patch<{
    Params: { id: string };
    Body: {
      parentId?: number | null;
      title?: string;
      description?: string | null;
      isFavorite?: boolean;
      kind?: string;
      studio?: string | null;
      thumbnailPositionX?: number;
      thumbnailPositionY?: number;
      thumbnailScale?: number;
      /** 'landscape' | 'portrait', or null to follow the Appearance setting. */
      tileShape?: string | null;
      /** 1–5 stars, or null to clear. */
      rating?: number | null;
      seriesId?: number | null;
      seasonNumber?: number | null;
      episodeNumber?: number | null;
      episodeTitle?: string | null;
    };
  }>("/api/media-items/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) {
      reply.code(404);
      return { error: "Not found" };
    }
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      reply.code(400);
      return { error: "Expected a JSON object" };
    }
    if (!request.profile?.isOwner && OWNER_FIELDS.some((field) => field in body)) {
      reply.code(403);
      return { error: "Only the owner profile can edit item details", code: "owner_only" };
    }
    const {
      parentId,
      title,
      description,
      isFavorite,
      kind,
      studio,
      thumbnailPositionX,
      thumbnailPositionY,
      thumbnailScale,
      tileShape,
      rating,
      seriesId,
      seasonNumber,
      episodeNumber,
      episodeTitle,
    } = body;

    // Shape checks first, so a wrong type is a 400 naming the field rather
    // than a TypeError (or a Postgres error) surfacing as a 500.
    if (title !== undefined && typeof title !== "string") {
      reply.code(400);
      return { error: "title must be a string" };
    }
    if (title !== undefined && !title.trim()) {
      reply.code(400);
      return { error: "title cannot be empty" };
    }
    if (!isOptionalString(description)) {
      reply.code(400);
      return { error: "description must be a string or null" };
    }
    if (isFavorite !== undefined && typeof isFavorite !== "boolean") {
      reply.code(400);
      return { error: "isFavorite must be a boolean" };
    }
    if (kind !== undefined && typeof kind !== "string") {
      reply.code(400);
      return { error: "kind must be a string" };
    }
    if (!isOptionalString(studio)) {
      reply.code(400);
      return { error: "studio must be a string or null" };
    }
    if (!isOptionalString(episodeTitle)) {
      reply.code(400);
      return { error: "episodeTitle must be a string or null" };
    }
    if (seasonNumber !== undefined && seasonNumber !== null && !isNonNegativeInt(seasonNumber)) {
      reply.code(400);
      return { error: "seasonNumber must be a whole number of 0 or more, or null" };
    }
    if (episodeNumber !== undefined && episodeNumber !== null && !isNonNegativeInt(episodeNumber)) {
      reply.code(400);
      return { error: "episodeNumber must be a whole number of 0 or more, or null" };
    }
    if (parentId !== undefined && parentId !== null && !isId(parentId)) {
      reply.code(400);
      return { error: "parentId must be a positive whole number or null" };
    }
    if (seriesId !== undefined && seriesId !== null && !isId(seriesId)) {
      reply.code(400);
      return { error: "seriesId must be a positive whole number or null" };
    }

    if (parentId === id) {
      reply.code(400);
      return { error: "An item cannot be its own parent" };
    }
    if (parentId !== undefined && parentId !== null) {
      const [parent] = await db
        .select({ id: mediaItems.id })
        .from(mediaItems)
        .where(eq(mediaItems.id, parentId));
      if (!parent) {
        reply.code(400);
        return { error: "Parent not found" };
      }
      if (await wouldCreateCycle(id, parentId)) {
        reply.code(400);
        return { error: "An item cannot be moved inside one of its own descendants" };
      }
    }
    if (seriesId !== undefined && seriesId !== null) {
      const [found] = await db
        .select({ id: series.id })
        .from(series)
        .where(eq(series.id, seriesId));
      if (!found) {
        reply.code(400);
        return { error: "Series not found" };
      }
    }

    const patch: Partial<typeof mediaItems.$inferInsert> = { updatedAt: new Date() };
    if (parentId !== undefined) patch.parentId = parentId;
    if (title !== undefined) {
      patch.title = title.trim();
      // From here on the scanner leaves this title alone, even across renames.
      patch.titleSource = "user";
    }
    if (description !== undefined) patch.description = description;
    // Favourite and rating are the current profile's, written separately.
    const personal: { isFavorite?: boolean; rating?: number | null } = {};
    if (isFavorite !== undefined) personal.isFavorite = isFavorite;
    if (kind !== undefined) {
      // Checked against the categories table, so a category you created is
      // assignable — the old constant rejected everything but the three
      // seeded slugs, which meant the modal's own dropdown offered options
      // the save then refused.
      if (!(await categorySlugs()).has(kind)) {
        reply.code(400);
        return { error: "Unknown category" };
      }
      patch.kind = kind;
    }
    // Clamped rather than rejected: these come from a drag and a slider, so a
    // value a fraction outside the range is a rounding artefact, not a reason
    // to fail the save. Matches how the category cover framing is handled.
    if (thumbnailPositionX !== undefined) {
      patch.thumbnailPositionX = clampPercent(thumbnailPositionX, 0, 100);
    }
    if (thumbnailPositionY !== undefined) {
      patch.thumbnailPositionY = clampPercent(thumbnailPositionY, 0, 100);
    }
    // Floor of 100: below it the image stops covering its frame and shows
    // bars. Ceiling keeps a poster from being magnified into mush.
    if (thumbnailScale !== undefined) {
      patch.thumbnailScale = clampPercent(thumbnailScale, 100, 300);
    }
    // Rejected rather than clamped, unlike the framing above: those arrive
    // from a drag and a slider where a value just outside the range is a
    // rounding artefact, but this comes from a menu with two entries. A third
    // value is a bug or a hand-built request, and silently coercing it to
    // 'landscape' would hide which.
    //
    // null is a real value here — "follow the Appearance setting" — so it has
    // to pass through rather than being treated as "not supplied".
    if (tileShape !== undefined) {
      if (tileShape !== null && tileShape !== "landscape" && tileShape !== "portrait") {
        reply.code(400);
        return { error: "tileShape must be 'landscape', 'portrait', or null" };
      }
      patch.tileShape = tileShape;
    }
    // Rejected rather than clamped, for the same reason as tileShape: stars
    // come from five buttons, so 0 or 3.5 is a bug worth surfacing.
    if (rating !== undefined) {
      if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) {
        reply.code(400);
        return { error: "rating must be a whole number from 1 to 5, or null" };
      }
      personal.rating = rating;
    }
    if (studio !== undefined) {
      const name = studio?.trim();
      patch.studioId = name ? await ensureStudioId(name) : null;
      // From here the filename brackets stop deciding this item's studio.
      patch.studioSource = "user";
    }
    if (seriesId !== undefined) patch.seriesId = seriesId;
    if (seasonNumber !== undefined) patch.seasonNumber = seasonNumber;
    if (episodeNumber !== undefined) patch.episodeNumber = episodeNumber;
    // The scanner parses series, season and episode from the filename as one
    // unit, so correcting any of them hands all three over to the user.
    if (seriesId !== undefined || seasonNumber !== undefined || episodeNumber !== undefined) {
      patch.seriesSource = "user";
    }
    if (episodeTitle !== undefined) patch.episodeTitle = episodeTitle?.trim() || null;

    // Touched even when only personal fields changed: it is also what
    // tells a missing id from a real one.
    const metadataChanged = Object.keys(patch).length > 1;
    const updated = metadataChanged
      ? await db.update(mediaItems).set(patch).where(eq(mediaItems.id, id)).returning()
      : await db.select().from(mediaItems).where(eq(mediaItems.id, id));

    if (updated.length === 0) {
      reply.code(404);
      return { error: "Not found" };
    }
    await setItemState(profileId(request), id, personal);

    const changes: string[] = [];
    if (title !== undefined) changes.push(`title → "${title}"`);
    if (rating !== undefined) changes.push(rating ? `rated ${rating}★` : "rating cleared");
    if (isFavorite !== undefined) changes.push(isFavorite ? "favorited" : "unfavorited");
    if (studio !== undefined) changes.push(studio ? `studio → "${studio}"` : "studio cleared");
    if (description !== undefined) changes.push("description updated");
    // Another profile's favourites and stars are its own business, not the
    // library's activity log, which the owner reads.
    if (changes.length > 0 && request.profile?.isOwner) {
      const itemTitle = updated[0].title;
      await logActivity(
        "edit",
        `Edited "${itemTitle}": ${changes.join(", ")}`,
        { fields: changes },
        id,
      );
    }

    return { ok: true };
  });

  app.put<{ Params: { id: string }; Body: { hidden: boolean } }>(
    "/api/media-items/:id/hidden",
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === null) {
        reply.code(404);
        return { error: "Not found" };
      }
      const hidden = (request.body as { hidden?: unknown } | undefined)?.hidden;

      if (typeof hidden !== "boolean") {
        reply.code(400);
        return { error: "hidden must be a boolean" };
      }

      // Bringing something back out of the vault is what the PIN protects.
      const profile = profileId(request);
      if (!hidden && (await vaultPinConfigured(profile)) && !isVaultUnlocked(unlockKey(request))) {
        reply.code(403);
        return { error: "Unlock the vault to restore hidden items" };
      }

      const updated = await db
        .select({ id: mediaItems.id, title: mediaItems.title })
        .from(mediaItems)
        .where(eq(mediaItems.id, id));

      if (updated.length === 0) {
        reply.code(404);
        return { error: "Not found" };
      }
      // Hidden in this profile's vault only.
      await setItemState(profile, id, { hiddenAt: hidden ? new Date() : null });

      // Only the owner's own hides are logged: the log is library-wide and
      // naming what another profile hid would defeat its vault.
      if (request.profile?.isOwner) await logActivity(
        "hide",
        hidden ? `Hidden "${updated[0].title}"` : `Unhidden "${updated[0].title}"`,
        { hidden },
        id,
      );

      return { ok: true, hidden };
    }
  );
}
