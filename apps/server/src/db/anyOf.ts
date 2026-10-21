import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * `column = any($1::int[])` — membership in a list as ONE bind parameter.
 *
 * drizzle's `inArray` binds each element separately, and Postgres caps a
 * statement at 65,535 parameters. Library-wide operations (scope recompute,
 * forgetting a missing drive's worth of items, end-of-scan passes) routinely
 * pass lists that long on a large library, and the statement was refused
 * outright. node-postgres serialises a JS array as a Postgres array literal,
 * so the list travels as a single value however long it is.
 */
export function anyInt(column: AnyColumn, ids: readonly number[]): SQL {
  return sql`${column} = any(${sql.param([...ids])}::int[])`;
}

/** As anyInt, for text columns such as file paths. */
export function anyText(column: AnyColumn, values: readonly string[]): SQL {
  return sql`${column} = any(${sql.param([...values])}::text[])`;
}
