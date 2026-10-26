import { and, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { taggedUnder } from "../library/hierarchy.js";
import { mediaItems, mediaItemTypes, playbackStates } from "../db/schema.js";
import { itemIsFavorite, itemRating } from "../library/profileState.js";

export type SmartCondition =
  | { field: "tags"; op: "contains"; value: string }
  | { field: "itemType"; op: "eq"; value: string }
  | { field: "itemType"; op: "in"; value: string[] }
  | { field: "createdAt"; op: "within_last_days"; value: number }
  | { field: "title"; op: "contains"; value: string }
  | { field: "rating"; op: "gte"; value: number }
  | { field: "favorite"; op: "eq"; value: boolean }
  | { field: "watched"; op: "eq"; value: boolean }
  | { field: "playCount"; op: "gte"; value: number }
  | { field: "durationMinutes"; op: "gte" | "lte"; value: number }
  | { field: "lastWatched"; op: "older_than_days"; value: number };

export type SmartRule = {
  op: "AND" | "OR";
  conditions: SmartCondition[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

// A structured, allow-listed compiler rather than a generic expression
// evaluator: every field/op pair below maps to one specific, parameterized
// SQL shape, so a smart-collection rule can never express arbitrary SQL.
//
// The playback conditions are subqueries rather than a join, for the same
// reason itemType's join is the caller's business: this only ever produces a
// WHERE condition, and a never-played item has no playback row to join to.
function compileCondition(condition: SmartCondition, profile: number): SQL {
  switch (condition.field) {
    case "tags": {
      // The tag and every tag under it, like the browse filter.
      return taggedUnder(condition.value);
    }
    case "itemType": {
      // Assumes the base query already joins media_item_types (see
      // collections.ts) — this compiler only ever produces a WHERE
      // condition, not a full query, so it can't add that join itself.
      return condition.op === "eq"
        ? eq(mediaItemTypes.name, condition.value)
        : inArray(mediaItemTypes.name, condition.value);
    }
    case "createdAt": {
      const cutoff = new Date(Date.now() - condition.value * DAY_MS);
      return gte(mediaItems.createdAt, cutoff);
    }
    case "title": {
      // Escaped, because `%` and `_` are LIKE wildcards and `\` is its escape
      // character: a rule for titles containing "100%" matched every title
      // containing "100", and "a_b" matched "axb".
      return ilike(mediaItems.title, `%${escapeLike(String(condition.value))}%`);
    }
    case "rating": {
      // Unrated items fail this (NULL >= n is not true), which is what a
      // rating rule means: things you rated that highly, not things you
      // haven't rated yet.
      return gte(itemRating(profile, mediaItems.id), condition.value);
    }
    case "favorite": {
      return eq(itemIsFavorite(profile, mediaItems.id), condition.value);
    }
    case "watched": {
      const watched = sql`exists (
        select 1 from ${playbackStates} ps
        where ps.media_item_id = ${mediaItems.id} and ps.profile_id = ${profile} and ps.completed_at is not null
      )`;
      return condition.value ? watched : sql`not ${watched}`;
    }
    case "playCount": {
      return sql`coalesce((
        select ps.play_count from ${playbackStates} ps
        where ps.media_item_id = ${mediaItems.id} and ps.profile_id = ${profile}
      ), 0) >= ${condition.value}`;
    }
    case "durationMinutes": {
      const seconds = condition.value * 60;
      return condition.op === "gte"
        ? gte(mediaItems.durationSeconds, seconds)
        : lte(mediaItems.durationSeconds, seconds);
    }
    case "lastWatched": {
      // Played at some point, and not since the cutoff. A never-played item
      // is left out on purpose: "not watched in 90 days" is the forgotten
      // favourite you used to return to, and "never watched" is its own
      // condition above — folding it in would bury one list under the other.
      const cutoff = new Date(Date.now() - condition.value * DAY_MS);
      return sql`exists (
        select 1 from ${playbackStates} ps
        where ps.media_item_id = ${mediaItems.id} and ps.profile_id = ${profile}
          and (ps.play_count > 0 or ps.position_seconds > 0 or ps.completed_at is not null)
          and ps.updated_at < ${cutoff}
      )`;
    }
  }
}

/**
 * Collections are shared, but favourite, rating and watch history are per
 * profile — so a rule is compiled for the profile looking at it, and "my
 * 5-star favourites" means the viewer's own.
 */
export function compileSmartRule(rule: SmartRule, profile: number): SQL {
  const compiled = rule.conditions.map((condition) => compileCondition(condition, profile));
  if (compiled.length === 0) {
    // An empty rule matches nothing, rather than everything by accident.
    return eq(mediaItems.id, -1);
  }
  return (rule.op === "OR" ? or(...compiled) : and(...compiled))!;
}

const isWholeNumber = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/**
 * Checks a rule from a request body, returning an error message or null.
 *
 * The compiler trusts its input, and an unrecognised field would fall out of
 * its switch as `undefined` — which `and()` quietly drops, so a typo in one
 * condition would widen the collection to everything the others match.
 */
export function smartRuleError(rule: unknown): string | null {
  if (typeof rule !== "object" || rule === null) return "smartRule must be an object";
  const { op, conditions } = rule as { op?: unknown; conditions?: unknown };
  if (op !== "AND" && op !== "OR") return "smartRule.op must be AND or OR";
  if (!Array.isArray(conditions)) return "smartRule.conditions must be a list";

  for (const [index, raw] of conditions.entries()) {
    const c = raw as { field?: unknown; op?: unknown; value?: unknown };
    const where = `condition ${index + 1}`;
    const valid = (() => {
      switch (c.field) {
        case "tags":
        case "title":
          return c.op === "contains" && typeof c.value === "string" && c.value.trim() !== "";
        case "itemType":
          return (
            (c.op === "eq" && typeof c.value === "string") ||
            (c.op === "in" && Array.isArray(c.value) && c.value.every((v) => typeof v === "string"))
          );
        case "createdAt":
          return c.op === "within_last_days" && isWholeNumber(c.value, 1, 36500);
        case "rating":
          return c.op === "gte" && isWholeNumber(c.value, 1, 5);
        case "favorite":
        case "watched":
          return c.op === "eq" && typeof c.value === "boolean";
        case "playCount":
          return c.op === "gte" && isWholeNumber(c.value, 1, 100000);
        case "durationMinutes":
          return (c.op === "gte" || c.op === "lte") && isWholeNumber(c.value, 1, 100000);
        case "lastWatched":
          return c.op === "older_than_days" && isWholeNumber(c.value, 1, 36500);
        default:
          return false;
      }
    })();
    if (!valid) return `${where} is not a valid rule`;
  }
  return null;
}

/** Makes a string match itself literally inside a LIKE/ILIKE pattern. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
