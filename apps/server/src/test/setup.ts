// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

/**
 * Creates the test database before any test runs.
 *
 * Deliberately a *real* Postgres rather than a mock. Two of the bugs that
 * reached production in this project — a float bound where an integer was
 * inferred, and an ambiguous column in a correlated subquery — were invisible
 * to hand-written SQL and would have been invisible to a mock too. Only the
 * real driver against the real server catches that class of mistake.
 */
import { Client } from "pg";

const ADMIN_URL = process.env.TEST_ADMIN_URL ?? "postgres://media:media@localhost:5432/media";
const TEST_DB = "media_test";

export async function setup(): Promise<void> {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  // Dropped and recreated so a failed run can never leave rows behind that
  // make the next run pass or fail for the wrong reason.
  await client.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await client.query(`CREATE DATABASE ${TEST_DB}`);
  await client.end();
}

export async function teardown(): Promise<void> {
  // Left in place on purpose: when a test fails, being able to open the
  // database and look is worth more than a tidy server.
}
