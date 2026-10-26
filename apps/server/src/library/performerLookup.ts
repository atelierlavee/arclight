import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { performerAliases, performers } from "../db/schema.js";

/**
 * The performer a spelling refers to: by name first, then by alias.
 *
 * The one place both the scanner and the editor resolve a name, so "Jane D."
 * means the same person whether it came from a folder or was typed in.
 * lower(a) = lower(b) rather than ilike: `_` and `%` are LIKE wildcards, so
 * a performer named "Alice_B" would ilike-match "AliceXB". It also lets
 * Postgres use the lower() unique indexes.
 */
export async function findPerformerIdByName(name: string): Promise<number | null> {
  const [byName] = await db
    .select({ id: performers.id })
    .from(performers)
    .where(sql`lower(${performers.name}) = lower(${name})`);
  if (byName) return byName.id;

  const [byAlias] = await db
    .select({ id: performerAliases.performerId })
    .from(performerAliases)
    .where(sql`lower(${performerAliases.alias}) = lower(${name})`);
  return byAlias?.id ?? null;
}

/**
 * Who else already answers to `name`, as a name or an alias — the clash a
 * rename or a new alias would create. `exceptPerformerId` is the performer
 * being edited: their own name and aliases are not a clash with themselves.
 */
export async function performerNameOwner(
  name: string,
  exceptPerformerId: number,
): Promise<{ id: number; name: string } | null> {
  const [byName] = await db
    .select({ id: performers.id, name: performers.name })
    .from(performers)
    .where(and(sql`lower(${performers.name}) = lower(${name})`, ne(performers.id, exceptPerformerId)));
  if (byName) return byName;

  const [byAlias] = await db
    .select({ id: performers.id, name: performers.name })
    .from(performerAliases)
    .innerJoin(performers, eq(performers.id, performerAliases.performerId))
    .where(
      and(
        sql`lower(${performerAliases.alias}) = lower(${name})`,
        ne(performerAliases.performerId, exceptPerformerId),
      ),
    );
  return byAlias ?? null;
}
