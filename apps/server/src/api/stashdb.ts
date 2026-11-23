// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { performers, studios, tags } from "../db/schema.js";
import {
  getStashDbKey,
  searchStashDbPerformers,
  searchStashDbScenes,
  StashDbError,
} from "../metadata/stashdb.js";

type Named = { name: string; inLibrary: boolean };

/**
 * Marks which of these names already exist, case-insensitively. Applying a
 * scene can create performers, studios and tags that do not exist yet, which
 * should be a choice rather than a side effect, so the page needs to know.
 */
async function markExisting(
  table: typeof performers | typeof studios | typeof tags,
  names: string[],
): Promise<Map<string, boolean>> {
  if (names.length === 0) return new Map();
  const lowered = names.map((name) => name.toLowerCase());
  const rows = await db
    .select({ name: table.name })
    .from(table)
    .where(inArray(sql`lower(${table.name})`, lowered));
  const have = new Set(rows.map((row) => row.name.toLowerCase()));
  return new Map(names.map((name) => [name, have.has(name.toLowerCase())]));
}

/**
 * StashDB performer and scene lookups.
 *
 * The API key is read from the server's environment (STASHDB_API_KEY) and
 * never sent to the page — the page is only told whether one is set. Routes
 * are owner-only (auth/ownerRoutes.ts), since they spend the owner's key.
 */
export async function stashDbRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/stashdb", async () => ({ configured: getStashDbKey() !== null }));

  app.get<{ Querystring: { q?: string } }>("/api/stashdb/performers", async (request, reply) => {
    const term = request.query.q?.trim();
    if (!term || term.length > 200) {
      reply.code(400);
      return { error: "Give a name to look up." };
    }
    const apiKey = getStashDbKey();
    if (!apiKey) {
      reply.code(400);
      return { error: "Set STASHDB_API_KEY on the server to use StashDB." };
    }
    try {
      return { performers: await searchStashDbPerformers(apiKey, term) };
    } catch (err) {
      if (err instanceof StashDbError) {
        reply.code(err.status);
        return { error: err.message };
      }
      throw err;
    }
  });

  app.get<{ Querystring: { q?: string } }>("/api/stashdb/scenes", async (request, reply) => {
    const term = request.query.q?.trim();
    if (!term || term.length > 300) {
      reply.code(400);
      return { error: "Give a title to look up." };
    }
    const apiKey = getStashDbKey();
    if (!apiKey) {
      reply.code(400);
      return { error: "Set STASHDB_API_KEY on the server to use StashDB." };
    }
    try {
      const found = await searchStashDbScenes(apiKey, term);
      const names = (pick: (scene: (typeof found)[number]) => string[]) => [
        ...new Set(found.flatMap(pick)),
      ];
      const [havePerformers, haveStudios, haveTags] = await Promise.all([
        markExisting(performers, names((scene) => scene.performers)),
        markExisting(studios, names((scene) => (scene.studio ? [scene.studio] : []))),
        markExisting(tags, names((scene) => scene.tags)),
      ]);
      const mark = (have: Map<string, boolean>) => (name: string): Named => ({
        name,
        inLibrary: have.get(name) ?? false,
      });
      return {
        scenes: found.map((scene) => ({
          ...scene,
          studio: scene.studio ? mark(haveStudios)(scene.studio) : null,
          performers: scene.performers.map(mark(havePerformers)),
          tags: scene.tags.map(mark(haveTags)),
        })),
      };
    } catch (err) {
      if (err instanceof StashDbError) {
        reply.code(err.status);
        return { error: err.message };
      }
      throw err;
    }
  });
}
