import { type SQL, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { mediaItems } from "../db/schema.js";

/**
 * Tag families and studio networks, as subqueries.
 *
 * Filtering by "Outdoor" means Outdoor and everything under it; filtering by
 * a network means the network and all its sites. Each function here returns
 * the set of ids that a filter should accept, as a recursive subquery a
 * caller drops into `x in (...)`.
 *
 * Raw SQL with explicit aliases rather than the query builder: drizzle
 * renders a column unqualified when the outer query has one table, and the
 * recursive half joins a table to itself. UNION rather than UNION ALL is what
 * keeps a loop — which the edit routes refuse, but a restore could bring
 * back — from recursing forever.
 */

/** Ids of the tags named `name` (ignoring case) and every tag under them. */
export function tagIdsUnderName(name: string): SQL {
  return sql`(
    with recursive under(id) as (
      select t.id from tags t where lower(t.name) = lower(${name})
      union
      select tp.tag_id from tag_parents tp join under u on tp.parent_id = u.id
    )
    select id from under
  )`;
}

/** Items tagged `name` or any tag under it, as a WHERE condition on media_items. */
export function taggedUnder(name: string): SQL {
  return sql`${mediaItems.id} in (
    select mit.media_item_id from media_item_tags mit
    where mit.tag_id in ${tagIdsUnderName(name)}
  )`;
}

/** Ids of the studios named `name` (ignoring case) and every site under them. */
export function studioIdsUnderName(name: string): SQL {
  return sql`(
    with recursive under(id) as (
      select s.id from studios s where lower(s.name) = lower(${name})
      union
      select c.id from studios c join under u on c.parent_id = u.id
    )
    select id from under
  )`;
}

/** Ids of the studios under `studioId`, including itself. */
export function studioIdsUnder(studioId: number): SQL {
  return sql`(
    with recursive under(id) as (
      select ${studioId}::int
      union
      select c.id from studios c join under u on c.parent_id = u.id
    )
    select id from under
  )`;
}

/**
 * Every tag below `tagId`, not including itself. A tag cannot take one of
 * these as a parent: that would put it underneath itself.
 */
export async function tagDescendantIds(tagId: number): Promise<number[]> {
  const rows = await db.execute<{ id: number }>(sql`
    with recursive under(id) as (
      select tp.tag_id from tag_parents tp where tp.parent_id = ${tagId}
      union
      select tp.tag_id from tag_parents tp join under u on tp.parent_id = u.id
    )
    select id from under
  `);
  return rows.rows.map((row) => Number(row.id));
}

/** Every studio below `studioId`, not including itself. */
export async function studioDescendantIds(studioId: number): Promise<number[]> {
  const rows = await db.execute<{ id: number }>(sql`
    with recursive under(id) as (
      select c.id from studios c where c.parent_id = ${studioId}
      union
      select c.id from studios c join under u on c.parent_id = u.id
    )
    select id from under
  `);
  return rows.rows.map((row) => Number(row.id));
}
