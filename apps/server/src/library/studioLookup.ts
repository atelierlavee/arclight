import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { studioAliases, studios } from "../db/schema.js";

/**
 * The studio a spelling refers to: by name first, then by alias. The
 * scanner and the editor both resolve through this, so `[BlackedRaw]` and a
 * typed "Blacked Raw" land on one studio once either is an alias.
 * lower(a) = lower(b) for the same reasons as performerLookup.ts.
 */
export async function findStudioIdByName(name: string): Promise<number | null> {
  const [byName] = await db
    .select({ id: studios.id })
    .from(studios)
    .where(sql`lower(${studios.name}) = lower(${name})`);
  if (byName) return byName.id;

  const [byAlias] = await db
    .select({ id: studioAliases.studioId })
    .from(studioAliases)
    .where(sql`lower(${studioAliases.alias}) = lower(${name})`);
  return byAlias?.id ?? null;
}

/**
 * Who else already answers to `name`, as a name or an alias. `exceptStudioId`
 * is the studio being edited (or null when creating one).
 */
export async function studioNameOwner(
  name: string,
  exceptStudioId: number | null,
): Promise<{ id: number; name: string } | null> {
  const [byName] = await db
    .select({ id: studios.id, name: studios.name })
    .from(studios)
    .where(
      and(
        sql`lower(${studios.name}) = lower(${name})`,
        exceptStudioId === null ? undefined : ne(studios.id, exceptStudioId),
      ),
    );
  if (byName) return byName;

  const [byAlias] = await db
    .select({ id: studios.id, name: studios.name })
    .from(studioAliases)
    .innerJoin(studios, eq(studios.id, studioAliases.studioId))
    .where(
      and(
        sql`lower(${studioAliases.alias}) = lower(${name})`,
        exceptStudioId === null ? undefined : ne(studioAliases.studioId, exceptStudioId),
      ),
    );
  return byAlias ?? null;
}
