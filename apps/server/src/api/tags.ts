import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { isUniqueViolation } from "../db/errors.js";
import { mediaItemTags, mediaItems, tagAliases, tagParents, tags } from "../db/schema.js";
import { logActivity } from "../activity/log.js";
import { profileId } from "../auth/profileContext.js";
import { tagDescendantIds } from "../library/hierarchy.js";
import { visibleItems } from "../library/visibility.js";
import { parseId } from "./mediaItemQueries.js";
import { parseAliases } from "./performerDetails.js";

/** Generous for a tag editor, small enough that one request can't create thousands of rows. */
const MAX_TAGS = 200;
const MAX_TAG_LENGTH = 100;
const MAX_PARENTS = 20;
const MAX_DESCRIPTION = 2000;

/**
 * The tag each typed name means, creating the ones that are new.
 *
 * Resolved before anything is created, most deliberate match first: the exact
 * spelling, then the same name in other capitals, then an alias. Without the
 * last two, typing "beach" beside an existing "Beach", or "Doggystyle" where
 * it is an alias of "Doggy", made a second tag that filters never joined up.
 */
async function resolveTagIds(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  names: string[],
): Promise<number[]> {
  const lowered = names.map((name) => name.toLowerCase());
  const existing = await tx
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(sql`lower(${tags.name}) = any(${sql.param(lowered)}::text[])`)
    .orderBy(tags.id);
  const aliases = await tx
    .select({ tagId: tagAliases.tagId, alias: tagAliases.alias })
    .from(tagAliases)
    .where(sql`lower(${tagAliases.alias}) = any(${sql.param(lowered)}::text[])`);

  const ids = new Map<string, number>();
  const unresolved: string[] = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    const id =
      existing.find((tag) => tag.name === name)?.id ??
      existing.find((tag) => tag.name.toLowerCase() === lower)?.id ??
      aliases.find((alias) => alias.alias.toLowerCase() === lower)?.tagId;
    if (id === undefined) unresolved.push(name);
    else ids.set(lower, id);
  }

  if (unresolved.length > 0) {
    // A concurrent save creating the same name is absorbed by ON CONFLICT,
    // and the read-back below finds the winner's row.
    await tx
      .insert(tags)
      .values(unresolved.map((name) => ({ name })))
      .onConflictDoNothing({ target: tags.name });
    const created = await tx
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(inArray(tags.name, unresolved));
    for (const tag of created) ids.set(tag.name.toLowerCase(), tag.id);
  }

  return [...new Set(ids.values())];
}

/** Who else answers to `name` as a tag name or alias, other than `tagId`. */
async function tagNameOwner(name: string, tagId: number): Promise<string | null> {
  const [byName] = await db
    .select({ name: tags.name })
    .from(tags)
    .where(and(sql`lower(${tags.name}) = lower(${name})`, ne(tags.id, tagId)));
  if (byName) return byName.name;
  const [byAlias] = await db
    .select({ name: tags.name })
    .from(tagAliases)
    .innerJoin(tags, eq(tags.id, tagAliases.tagId))
    .where(and(sql`lower(${tagAliases.alias}) = lower(${name})`, ne(tagAliases.tagId, tagId)));
  return byAlias?.name ?? null;
}

export async function tagRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Every tag, with what the tags page needs to draw the families: who each
   * one sits under, its other names, and how many visible items carry it
   * directly. Directly, not including the tags under it: those overlap, so
   * their counts cannot be added up, and the page shows each child's own.
   */
  app.get("/api/tags", async (request) => {
    const profile = profileId(request);
    const rows = await db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
        description: tags.description,
        createdAt: tags.createdAt,
        // count(<column>) over the LEFT JOIN, so an unused tag reads 0, not 1.
        itemCount: sql<number>`count(${mediaItems.id})::int`,
      })
      .from(tags)
      .leftJoin(mediaItemTags, eq(mediaItemTags.tagId, tags.id))
      .leftJoin(
        mediaItems,
        and(eq(mediaItems.id, mediaItemTags.mediaItemId), visibleItems(profile)),
      )
      .groupBy(tags.id)
      .orderBy(tags.name);

    const parents = await db.select().from(tagParents);
    const aliases = await db
      .select({ tagId: tagAliases.tagId, alias: tagAliases.alias })
      .from(tagAliases)
      .orderBy(sql`lower(${tagAliases.alias})`);

    return {
      tags: rows.map((row) => ({
        ...row,
        parentIds: parents.filter((p) => p.tagId === row.id).map((p) => p.parentId),
        aliases: aliases.filter((a) => a.tagId === row.id).map((a) => a.alias),
      })),
    };
  });

  /**
   * A tag's place in the families and its other names. Each list replaces
   * the old one, as the editor sends whole lists.
   */
  app.patch<{
    Params: { id: string };
    Body: { description?: string | null; parentIds?: number[]; aliases?: string[] };
  }>("/api/tags/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    const [tag] = id === null ? [] : await db.select().from(tags).where(eq(tags.id, id));
    if (!tag) {
      reply.code(404);
      return { error: "Not found" };
    }
    const body = request.body ?? {};

    let description: string | null | undefined;
    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description !== "string") {
        reply.code(400);
        return { error: "description must be text" };
      }
      description = body.description?.trim() || null;
      if (description && description.length > MAX_DESCRIPTION) {
        reply.code(400);
        return { error: `description must be at most ${MAX_DESCRIPTION} characters` };
      }
    }

    let parentIds: number[] | undefined;
    if (body.parentIds !== undefined) {
      const raw = body.parentIds;
      if (!Array.isArray(raw) || !raw.every((p) => Number.isInteger(p))) {
        reply.code(400);
        return { error: "parentIds must be a list of tag ids" };
      }
      parentIds = [...new Set(raw)];
      if (parentIds.length > MAX_PARENTS) {
        reply.code(400);
        return { error: `A tag can have at most ${MAX_PARENTS} parents` };
      }
      if (parentIds.includes(tag.id)) {
        reply.code(400);
        return { error: "A tag cannot be its own parent" };
      }
      const found =
        parentIds.length === 0
          ? []
          : await db.select({ id: tags.id }).from(tags).where(inArray(tags.id, parentIds));
      if (found.length !== parentIds.length) {
        reply.code(400);
        return { error: "One of those parent tags does not exist" };
      }
      // A parent from underneath would make a loop: Beach under Outdoor
      // under Beach.
      const below = new Set(await tagDescendantIds(tag.id));
      const looping = parentIds.find((parentId) => below.has(parentId));
      if (looping !== undefined) {
        const [loopTag] = await db.select({ name: tags.name }).from(tags).where(eq(tags.id, looping));
        reply.code(400);
        return { error: `"${loopTag.name}" is already under "${tag.name}", so it cannot also be above it` };
      }
    }

    let aliases: string[] | undefined;
    if (body.aliases !== undefined) {
      const parsed = parseAliases(body.aliases, tag.name);
      if (!parsed.ok) {
        reply.code(400);
        return { error: parsed.error };
      }
      for (const alias of parsed.value) {
        const owner = await tagNameOwner(alias, tag.id);
        if (owner) {
          reply.code(409);
          return { error: `"${alias}" already belongs to the tag ${owner}` };
        }
      }
      aliases = parsed.value;
    }

    if (description === undefined && parentIds === undefined && aliases === undefined) {
      reply.code(400);
      return { error: "Nothing to update" };
    }

    try {
      await db.transaction(async (tx) => {
        if (description !== undefined) {
          await tx.update(tags).set({ description }).where(eq(tags.id, tag.id));
        }
        if (parentIds !== undefined) {
          await tx.delete(tagParents).where(eq(tagParents.tagId, tag.id));
          if (parentIds.length > 0) {
            await tx
              .insert(tagParents)
              .values(parentIds.map((parentId) => ({ tagId: tag.id, parentId })));
          }
        }
        if (aliases !== undefined) {
          await tx.delete(tagAliases).where(eq(tagAliases.tagId, tag.id));
          if (aliases.length > 0) {
            await tx.insert(tagAliases).values(aliases.map((alias) => ({ tagId: tag.id, alias })));
          }
        }
      });
    } catch (error) {
      // Two saves racing for one alias: the unique index decides.
      if (!isUniqueViolation(error)) throw error;
      reply.code(409);
      return { error: "That alias was just taken by another tag" };
    }

    return { ok: true };
  });

  // Replaces the full tag set for an item in one call (rather than separate
  // add/remove endpoints) — matches how a tag editor UI naturally works: you
  // edit the whole list, then save. Unknown tag names are created on the fly.
  app.put<{ Params: { id: string }; Body: { tagNames: string[] } }>(
    "/api/media-items/:id/tags",
    async (request, reply) => {
      const itemId = parseId(request.params.id);
      if (itemId === null) {
        reply.code(404);
        return { error: "Not found" };
      }

      const raw = (request.body as { tagNames?: unknown } | undefined)?.tagNames;
      if (!Array.isArray(raw) || !raw.every((n) => typeof n === "string")) {
        reply.code(400);
        return { error: "tagNames must be an array of strings" };
      }
      // Blank entries are dropped rather than rejected — a trailing comma in
      // the editor is not worth failing the save over.
      const tagNames = [...new Set((raw as string[]).map((n) => n.trim()).filter(Boolean))];
      if (tagNames.length > MAX_TAGS) {
        reply.code(400);
        return { error: `An item can have at most ${MAX_TAGS} tags` };
      }
      if (tagNames.some((n) => n.length > MAX_TAG_LENGTH)) {
        reply.code(400);
        return { error: `Tag names can be at most ${MAX_TAG_LENGTH} characters` };
      }

      const [item] = await db.select().from(mediaItems).where(eq(mediaItems.id, itemId));
      if (!item) {
        reply.code(404);
        return { error: "Not found" };
      }

      // One transaction, so a failure part-way can't leave the item with its
      // old tags deleted and the new ones never written.
      const assigned = await db.transaction(async (tx) => {
        const tagIds = tagNames.length > 0 ? await resolveTagIds(tx, tagNames) : [];
        const tagRows =
          tagIds.length > 0 ? await tx.select().from(tags).where(inArray(tags.id, tagIds)) : [];

        await tx.delete(mediaItemTags).where(eq(mediaItemTags.mediaItemId, itemId));
        if (tagRows.length > 0) {
          await tx
            .insert(mediaItemTags)
            .values(tagRows.map((tag) => ({ mediaItemId: itemId, tagId: tag.id })));
        }
        return tagRows.sort((a, b) => a.name.localeCompare(b.name));
      });

      await logActivity(
        "tag",
        `Tags on "${item.title}" set to ${tagNames.length > 0 ? tagNames.join(", ") : "(none)"}`,
        { tagNames },
        itemId,
      );

      return { tags: assigned };
    }
  );
}
