import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The restore and backup orchestration end to end, against the real test
 * database with real pg_dump, psql and tar.
 *
 * BACKUP_DIR is read once when create.ts is first evaluated, and the harness
 * pulls create.ts in through the routes, so it has to be set before any of
 * those imports run — hence vi.hoisted and the dynamic imports below rather
 * than static ones.
 */
const { backupDir } = vi.hoisted(() => {
  const dir = `${process.env.APP_DATA_DIR ?? "/tmp"}/restore-test-backups-${process.pid}`;
  process.env.BACKUP_DIR = dir;
  return { backupDir: dir };
});

const { rm } = await import("node:fs/promises");
const { sql } = await import("drizzle-orm");
const { db } = await import("../db/client.js");
const { libraries, mediaItems, mediaItemTypes } = await import("../db/schema.js");
const { resetDatabase, testApp } = await import("../test/harness.js");
const { createBackup, isBackupRunning } = await import("./create.js");
const { restoreBackup } = await import("./restore.js");
const { readRestoreMarker } = await import("./restoreState.js");

beforeEach(async () => {
  await testApp();
  await resetDatabase();
});

afterAll(async () => {
  // Leave the database the way every other suite expects to find it: the
  // restore below replaced it wholesale, extra table and all.
  await db.execute(sql`drop table if exists restore_test_newer`);
  await rm(backupDir, { recursive: true, force: true });
});

describe("restore", () => {
  it("restores an older dump over a database with tables it doesn't know", async () => {
    // The regression: a dump only drops what it contains, so a table added
    // after the backup was taken — with a foreign key to media_items, as
    // watch_log and playback_heatmap have — blocked the dump's own DROP of
    // media_items, and every older backup became unrestorable.
    const [library] = await db.insert(libraries).values({ name: "From backup" }).returning();
    const [videoType] = await db
      .select()
      .from(mediaItemTypes)
      .where(sql`${mediaItemTypes.name} = 'video'`);
    const [item] = await db
      .insert(mediaItems)
      .values({ libraryId: library.id, itemTypeId: videoType.id, title: "Kept" })
      .returning();

    const backup = await createBackup();

    // "Newer" state: a table the dump has never heard of, referencing the
    // item, plus a row that should vanish with the restore.
    await db.execute(sql`
      create table restore_test_newer (
        id serial primary key,
        media_item_id integer not null references media_items(id)
      )
    `);
    await db.execute(sql`insert into restore_test_newer (media_item_id) values (${item.id})`);
    await db.insert(libraries).values({ name: "After backup" });

    const result = await restoreBackup(backup.name);
    expect(result.ok).toBe(true);

    const names = (await db.select().from(libraries)).map((l) => l.name);
    expect(names).toEqual(["From backup"]);
    const titles = (await db.select().from(mediaItems)).map((i) => i.title);
    expect(titles).toEqual(["Kept"]);
    const leftover = await db.execute(sql`select to_regclass('public.restore_test_newer') as t`);
    expect(leftover.rows[0]?.t).toBeNull();
    // Success clears the marker; only an unfinished restore leaves one.
    expect(await readRestoreMarker()).toBeNull();
  }, 120_000);
});

describe("backup", () => {
  it("releases the lock when a backup fails, so the next one can run", async () => {
    const original = process.env.DATABASE_URL;
    // Nothing listens on port 1, so pg_dump fails straight away.
    process.env.DATABASE_URL = "postgres://media:media@127.0.0.1:1/nothing";
    try {
      await expect(createBackup()).rejects.toThrow();
    } finally {
      process.env.DATABASE_URL = original;
    }
    expect(isBackupRunning()).toBe(false);

    const next = await createBackup();
    expect(next.name).toMatch(/^media-server-/);
    expect(isBackupRunning()).toBe(false);
  }, 60_000);

  it("keeps the database password out of the failure message", async () => {
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://media:s3cret-pass@127.0.0.1:1/nothing";
    try {
      const error = await createBackup().catch((err: unknown) => err);
      expect(String(error instanceof Error ? error.message : error)).not.toContain(
        "s3cret-pass",
      );
    } finally {
      process.env.DATABASE_URL = original;
    }
  }, 60_000);
});
