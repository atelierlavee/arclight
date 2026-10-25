import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://media:media@localhost:5432/media_test";

// resetDatabase truncates every table, so a URL pointing at anything but the
// throwaway database would wipe real data.
if (new URL(databaseUrl).pathname !== "/media_test") {
  throw new Error(
    `Refusing to run tests: the test database must be named media_test, got ${databaseUrl}`,
  );
}

// Tests delete artwork directories and run restores, which swap whole upload
// folders. Both must land in a throwaway directory, never ./app-data or
// ./backups — those are the real library when run from a dev container.
const scratch = mkdtempSync(path.join(tmpdir(), "media-server-test-"));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test/setup.ts"],
    // Integration tests share one database, so they must not run in parallel
    // files — two suites truncating each other's rows mid-test would fail at
    // random and teach you to distrust the suite.
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    env: {
      DATABASE_URL: databaseUrl,
      APP_DATA_DIR: path.join(scratch, "app-data"),
      BACKUP_DIR: path.join(scratch, "backups"),
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      // Route handlers and the scanner ARE covered — by integration tests
      // against a real Postgres, not mocks. Only generated migrations, the
      // entry point and the harness itself are excluded.
      exclude: ["src/db/migrations/**", "src/app.ts", "src/test/**", "src/**/*.test.ts"],
    },
  },
});
