import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../buildApp.js";
import { db, runMigrations } from "../db/client.js";
import { seed, seedCategories } from "../db/seed.js";
import { hashPassword } from "../auth/passwords.js";
import { sessions, users } from "../db/schema.js";
import { SESSION_COOKIE } from "../auth/sessions.js";
import { randomBytes } from "node:crypto";

let app: FastifyInstance | null = null;

/** One registered method + path, e.g. { method: "GET", url: "/api/tags/:id" }. */
export type RegisteredRoute = { method: string; url: string };
const routes: RegisteredRoute[] = [];

/** Builds the app once per test file and runs migrations against the test DB. */
export async function testApp(): Promise<FastifyInstance> {
  if (app) return app;
  await runMigrations();
  app = await buildApp({
    onRoute: (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      for (const method of methods) routes.push({ method, url: route.url });
    },
  });
  await app.ready();
  return app;
}

/**
 * Every route the app registered, for tests that sweep the whole API rather
 * than the routes someone remembered to list — a new route is then checked
 * against the rules every route must follow the moment it exists.
 */
export async function registeredRoutes(): Promise<RegisteredRoute[]> {
  await testApp();
  return [...routes];
}

/**
 * Empties every table, then re-seeds the categories the app assumes exist.
 *
 * TRUNCATE ... CASCADE in one statement rather than deletes in dependency
 * order: the order is a detail of the schema, and a test suite that has to be
 * updated whenever a foreign key is added is a suite people stop running.
 */
export async function resetDatabase(): Promise<void> {
  const rows = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`
  );
  const tables = rows.rows
    .map((r) => `"${r.tablename}"`)
    .filter((t) => !t.includes("__drizzle"));
  if (tables.length > 0) {
    await db.execute(sql.raw(`truncate table ${tables.join(", ")} restart identity cascade`));
  }
  // Both halves of the app's baseline state. media_item_types in particular
  // is not optional — routes that create a folder or a photo look the type up
  // and fail outright when the table is empty.
  await seed();
  await seedCategories();
}

/**
 * A signed-in session cookie.
 *
 * Every route is behind a deny-by-default guard, so without this a test can
 * only ever assert 401 — which would tell you the guard works and nothing
 * else about the route.
 */
export async function signIn(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ username: "tester", passwordHash: await hashPassword("test-password") })
    .returning();

  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(sessions).values({ id, userId: user.id, expiresAt });
  return `${SESSION_COOKIE}=${id}`;
}
