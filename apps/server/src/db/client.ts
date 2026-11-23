// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type PoolClient } from "pg";
import * as schema from "./schema.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// An idle client losing its connection — Postgres restarting under us, a
// container being recreated — emits 'error' on the pool. Unhandled, that is an
// uncaught exception that takes the whole server down while it is otherwise
// healthy. The pool discards the dead client either way, so logging is enough:
// the next query opens a fresh connection.
pool.on("error", (err) => {
  console.warn("db: idle client error:", err.message);
});

export const db = drizzle(pool, { schema });

export async function checkDbConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

const CONNECT_ATTEMPTS = 30;
const CONNECT_RETRY_MS = 1000;

/**
 * Blocks until Postgres accepts a connection, or gives up after ~30s.
 *
 * Compose's `depends_on: service_healthy` only orders the *first* start, so
 * restarting this container alone — or recreating Postgres underneath it —
 * can land us here before the `postgres` host even resolves. Letting that
 * reject killed the process for good: `tsx watch` keeps the container alive,
 * so Docker's `restart: unless-stopped` never fired and nothing listened on
 * 3000 until someone touched a file.
 */
async function waitForDb(): Promise<void> {
  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
    if (await checkDbConnection()) return;
    if (attempt === CONNECT_ATTEMPTS) break;
    console.warn(
      `db: unreachable (attempt ${attempt}/${CONNECT_ATTEMPTS}), retrying in ${CONNECT_RETRY_MS}ms`
    );
    await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_MS));
  }
  throw new Error(
    `db: unreachable after ${CONNECT_ATTEMPTS} attempts over ` +
      `${(CONNECT_ATTEMPTS * CONNECT_RETRY_MS) / 1000}s — is Postgres running?`
  );
}

export async function runMigrations(): Promise<void> {
  // Only the connection is retried. Once Postgres answers, a failing migration
  // is a real defect in the SQL and must surface immediately rather than being
  // replayed until the attempts run out.
  await waitForDb();
  const migrationsFolder = path.resolve(import.meta.dirname, "migrations");
  await migrate(db, { migrationsFolder });
}

const POOL_DRAIN_TIMEOUT_MS = 15_000;

/**
 * Destroys every pooled connection, waiting for in-flight queries to finish.
 *
 * Needed before a restore replaces the database underneath us. An idle backend
 * holds no locks, but a query that is *mid-flight* holds ACCESS SHARE, which
 * conflicts with the ACCESS EXCLUSIVE that `DROP TABLE` takes — and with no
 * lock_timeout set, a blocked DROP waits forever while every later reader
 * queues behind it.
 *
 * Not `pool.end()`: that sets `ending` permanently and every later connect()
 * rejects with "Cannot use a pool after calling end on the pool", with no way
 * back. Acquiring every slot instead *is* the barrier — once we hold them all,
 * no handler can be mid-query — and releasing each with an error destroys the
 * client rather than returning it, so the next acquire dials a fresh one.
 *
 * The timeout is not optional. A handler holding a client while awaiting
 * something that needs another one would deadlock this, and the caller must
 * treat a rejection as "abort the restore", not "carry on anyway".
 */
export async function drainPool(): Promise<void> {
  const max = pool.options.max ?? 10;
  // Collected as each acquisition resolves, not only if all of them do: on a
  // timeout the ones that already succeeded still have to go back, or every
  // drain attempt would permanently shrink the pool by however many it won.
  const acquired: PoolClient[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      Promise.all(
        Array.from({ length: max }, () =>
          pool.connect().then((client) => {
            acquired.push(client);
          })
        )
      ),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `db: pool did not drain within ${POOL_DRAIN_TIMEOUT_MS}ms`
              )
            ),
          POOL_DRAIN_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    // Releasing with an error routes through _remove -> client.end(), so the
    // connection is destroyed rather than handed back with a view of a
    // database that is about to be dropped.
    for (const client of acquired) {
      client.release(new Error("pool recycled for restore"));
    }
  }
}
