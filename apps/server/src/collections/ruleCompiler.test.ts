import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { mediaItems, mediaItemTypes, playbackStates } from "../db/schema.js";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import { makeItem, makeLibrary, makePhoto, ownerProfileId } from "../test/fixtures.js";
import { compileSmartRule, smartRuleError, type SmartRule } from "./ruleCompiler.js";

let libraryId: number;

/** Runs a compiled rule as a real query — the only way to know it is valid SQL. */
async function matching(rule: SmartRule): Promise<string[]> {
  const rows = await db
    .select({ title: mediaItems.title })
    .from(mediaItems)
    .innerJoin(mediaItemTypes, eq(mediaItems.itemTypeId, mediaItemTypes.id))
    .where(and(compileSmartRule(rule, await ownerProfileId())));
  return rows.map((r) => r.title).sort();
}

beforeEach(async () => {
  await testApp();
  await resetDatabase();
  // Rules that read favourites, ratings or history evaluate for a profile.
  await signIn();
  ({ libraryId } = await makeLibrary());
});

describe("compileSmartRule", () => {
  it("matches on a title substring", async () => {
    await makeItem(libraryId, { title: "Hot Wife Vacation" });
    await makeItem(libraryId, { title: "Something Else" });
    expect(
      await matching({ op: "AND", conditions: [{ field: "title", op: "contains", value: "wife" }] })
    ).toEqual(["Hot Wife Vacation"]);
  });

  it("treats LIKE wildcards in a title as literal characters", async () => {
    // `%` and `_` are wildcards: unescaped, "100%" matched anything starting
    // "100" and "a_b" matched "axb".
    await makeItem(libraryId, { title: "100% Real" });
    await makeItem(libraryId, { title: "1000 Ways" });
    await makeItem(libraryId, { title: "a_b" });
    await makeItem(libraryId, { title: "axb" });
    await makeItem(libraryId, { title: "back\\slash" });
    expect(
      await matching({ op: "AND", conditions: [{ field: "title", op: "contains", value: "100%" }] })
    ).toEqual(["100% Real"]);
    expect(
      await matching({ op: "AND", conditions: [{ field: "title", op: "contains", value: "a_b" }] })
    ).toEqual(["a_b"]);
    expect(
      await matching({ op: "AND", conditions: [{ field: "title", op: "contains", value: "k\\s" }] })
    ).toEqual(["back\\slash"]);
  });

  it("matches on item type", async () => {
    await makeItem(libraryId, { title: "A Video" });
    await makePhoto(libraryId, "A Photo");
    expect(
      await matching({ op: "AND", conditions: [{ field: "itemType", op: "eq", value: "photo" }] })
    ).toEqual(["A Photo"]);
  });

  it("requires every condition with AND", async () => {
    await makeItem(libraryId, { title: "Alpha Beta" });
    await makeItem(libraryId, { title: "Alpha Only" });
    expect(
      await matching({
        op: "AND",
        conditions: [
          { field: "title", op: "contains", value: "Alpha" },
          { field: "title", op: "contains", value: "Beta" },
        ],
      })
    ).toEqual(["Alpha Beta"]);
  });

  it("requires only one condition with OR", async () => {
    await makeItem(libraryId, { title: "Alpha" });
    await makeItem(libraryId, { title: "Beta" });
    await makeItem(libraryId, { title: "Gamma" });
    expect(
      await matching({
        op: "OR",
        conditions: [
          { field: "title", op: "contains", value: "Alpha" },
          { field: "title", op: "contains", value: "Beta" },
        ],
      })
    ).toEqual(["Alpha", "Beta"]);
  });

  it("ignores a field that is not on the allow-list", async () => {
    // The compiler must never interpolate an arbitrary field name into SQL.
    await makeItem(libraryId, { title: "Anything" });
    const rule = {
      op: "AND",
      conditions: [{ field: "passwordHash", op: "contains", value: "x" }],
    } as unknown as SmartRule;
    await expect(matching(rule)).resolves.toBeDefined();
  });

  it("does not break on a value containing SQL syntax", async () => {
    await makeItem(libraryId, { title: "Normal" });
    expect(
      await matching({
        op: "AND",
        conditions: [{ field: "title", op: "contains", value: "'; drop table media_items; --" }],
      })
    ).toEqual([]);
    // The table is still there.
    expect(await db.select().from(mediaItems)).toHaveLength(1);
  });

  describe("rating, favourite and playback conditions", () => {
    const DAY = 24 * 60 * 60 * 1000;
    const play = async (mediaItemId: number, state: Partial<typeof playbackStates.$inferInsert>) =>
      db.insert(playbackStates).values({ profileId: await ownerProfileId(), mediaItemId, ...state });

    it("matches a rating floor and leaves unrated items out", async () => {
      await makeItem(libraryId, { title: "Five", rating: 5 });
      await makeItem(libraryId, { title: "Three", rating: 3 });
      await makeItem(libraryId, { title: "Unrated" });
      expect(
        await matching({ op: "AND", conditions: [{ field: "rating", op: "gte", value: 4 }] })
      ).toEqual(["Five"]);
    });

    it("matches favourites", async () => {
      await makeItem(libraryId, { title: "Loved", isFavorite: true });
      await makeItem(libraryId, { title: "Plain" });
      expect(
        await matching({ op: "AND", conditions: [{ field: "favorite", op: "eq", value: true }] })
      ).toEqual(["Loved"]);
    });

    it("splits watched from never-watched, counting items with no playback row", async () => {
      const done = await makeItem(libraryId, { title: "Done" });
      const started = await makeItem(libraryId, { title: "Started" });
      await makeItem(libraryId, { title: "Untouched" });
      await play(done, { completedAt: new Date(), playCount: 1 });
      await play(started, { positionSeconds: 120 });

      expect(
        await matching({ op: "AND", conditions: [{ field: "watched", op: "eq", value: true }] })
      ).toEqual(["Done"]);
      expect(
        await matching({ op: "AND", conditions: [{ field: "watched", op: "eq", value: false }] })
      ).toEqual(["Started", "Untouched"]);
    });

    it("matches a play count, treating no playback row as zero", async () => {
      const often = await makeItem(libraryId, { title: "Often" });
      const once = await makeItem(libraryId, { title: "Once" });
      await makeItem(libraryId, { title: "Never" });
      await play(often, { playCount: 4, completedAt: new Date() });
      await play(once, { playCount: 1, completedAt: new Date() });
      expect(
        await matching({ op: "AND", conditions: [{ field: "playCount", op: "gte", value: 2 }] })
      ).toEqual(["Often"]);
    });

    it("matches duration bounds in minutes", async () => {
      await makeItem(libraryId, { title: "Long", durationSeconds: 45 * 60 });
      await makeItem(libraryId, { title: "Short", durationSeconds: 5 * 60 });
      await makeItem(libraryId, { title: "Unknown" });
      expect(
        await matching({ op: "AND", conditions: [{ field: "durationMinutes", op: "gte", value: 30 }] })
      ).toEqual(["Long"]);
      expect(
        await matching({ op: "AND", conditions: [{ field: "durationMinutes", op: "lte", value: 10 }] })
      ).toEqual(["Short"]);
    });

    it("finds things played before but not lately, and not things never played", async () => {
      const old = await makeItem(libraryId, { title: "Forgotten" });
      const recent = await makeItem(libraryId, { title: "Recent" });
      await makeItem(libraryId, { title: "Never" });
      await play(old, { playCount: 3, completedAt: new Date(Date.now() - 200 * DAY), updatedAt: new Date(Date.now() - 200 * DAY) });
      await play(recent, { playCount: 1, completedAt: new Date(), updatedAt: new Date() });
      expect(
        await matching({ op: "AND", conditions: [{ field: "lastWatched", op: "older_than_days", value: 90 }] })
      ).toEqual(["Forgotten"]);
    });

    it("combines them — the forgotten favourite", async () => {
      const a = await makeItem(libraryId, { title: "Old favourite", isFavorite: true });
      const b = await makeItem(libraryId, { title: "Old other" });
      for (const id of [a, b]) {
        await play(id, { playCount: 2, updatedAt: new Date(Date.now() - 120 * DAY) });
      }
      expect(
        await matching({
          op: "AND",
          conditions: [
            { field: "favorite", op: "eq", value: true },
            { field: "lastWatched", op: "older_than_days", value: 90 },
          ],
        })
      ).toEqual(["Old favourite"]);
    });
  });
});

describe("smartRuleError", () => {
  it("accepts every supported condition", () => {
    expect(
      smartRuleError({
        op: "AND",
        conditions: [
          { field: "tags", op: "contains", value: "x" },
          { field: "rating", op: "gte", value: 4 },
          { field: "favorite", op: "eq", value: false },
          { field: "watched", op: "eq", value: true },
          { field: "playCount", op: "gte", value: 2 },
          { field: "durationMinutes", op: "lte", value: 20 },
          { field: "lastWatched", op: "older_than_days", value: 90 },
        ],
      })
    ).toBeNull();
  });

  it("rejects an unknown field, which would otherwise widen the rule", () => {
    expect(
      smartRuleError({ op: "AND", conditions: [{ field: "passwordHash", op: "contains", value: "x" }] })
    ).toMatch(/condition 1/);
  });

  it("rejects out-of-range and wrongly-typed values", () => {
    expect(smartRuleError({ op: "AND", conditions: [{ field: "rating", op: "gte", value: 6 }] })).not.toBeNull();
    expect(smartRuleError({ op: "AND", conditions: [{ field: "rating", op: "gte", value: 2.5 }] })).not.toBeNull();
    expect(smartRuleError({ op: "AND", conditions: [{ field: "watched", op: "eq", value: "yes" }] })).not.toBeNull();
    expect(smartRuleError({ op: "XOR", conditions: [] })).not.toBeNull();
  });
});
