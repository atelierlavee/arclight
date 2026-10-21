import { describe, expect, it } from "vitest";
import {
  RestoreError,
  assertRestorable,
  findForbiddenMetaCommand,
  validateArchiveMembers,
  validateArchiveTypes,
} from "./restore.js";
import { pgEnvFromUrl } from "./pgEnv.js";
import { backupsToPrune } from "./create.js";
import { latestMigration } from "../db/journal.js";

/**
 * The two checks that stand between a restore and a broken library.
 *
 * Both are pure over their inputs on purpose — the surrounding orchestration
 * shells out to psql and tar, which the host running `npm test` may not have,
 * so the parts worth guarding are the ones that decide whether to shell out
 * at all.
 */
describe("archive member validation", () => {
  it("accepts the shape a backup actually has", () => {
    expect(
      validateArchiveMembers([
        "db.sql",
        "meta.json",
        "uploads/",
        "uploads/performer-images/",
        "uploads/performer-images/3-abc.jpg",
        "uploads/kind-covers/movies-1.jpg",
        "",
      ]),
    ).toEqual(["kind-covers", "performer-images"]);
  });

  it("refuses a member that escapes the extract directory", () => {
    // Extraction happens as the app user with write access to its own data
    // directory, so a `..` member is a write wherever it points.
    expect(() =>
      validateArchiveMembers(["db.sql", "uploads/../../etc/passwd"]),
    ).toThrow(RestoreError);
    expect(() => validateArchiveMembers(["/etc/passwd"])).toThrow(RestoreError);
  });

  it("refuses an archive carrying anything it shouldn't", () => {
    expect(() =>
      validateArchiveMembers(["db.sql", "payload.sh"]),
    ).toThrow(/unexpected entry/);
  });
});

describe("version gate", () => {
  it("refuses a dump taken by a newer version than the code running", async () => {
    const local = await latestMigration();
    expect(local).not.toBeNull();

    await expect(
      assertRestorable({
        latestMigrationTag: "9999_from_the_future",
        latestMigrationWhen: local!.when + 1,
      }),
    ).rejects.toThrow(/newer version/);
  });

  it("allows a dump at or behind the current migration level", async () => {
    const local = await latestMigration();
    await expect(
      assertRestorable({ latestMigrationWhen: local!.when }),
    ).resolves.toBeUndefined();
    await expect(
      assertRestorable({ latestMigrationWhen: 0 }),
    ).resolves.toBeUndefined();
  });

  it("allows archives predating the manifest", async () => {
    // Older than this feature by definition, so there is nothing to compare;
    // refusing them would make the backups already on disk unrestorable.
    await expect(assertRestorable(null)).resolves.toBeUndefined();
    await expect(assertRestorable({})).resolves.toBeUndefined();
  });
});

describe("pruning", () => {
  const at = (n: number) => ({
    name: `media-server-${n}.tar.gz`,
    sizeBytes: 1,
    createdAt: String(n),
  });
  // Newest first, the order listBackups() returns.
  const eleven = Array.from({ length: 11 }, (_, i) => at(11 - i));

  it("drops the oldest once past the cap", () => {
    expect(backupsToPrune(eleven)).toEqual(["media-server-1.tar.gz"]);
    expect(backupsToPrune(eleven.slice(0, 10))).toEqual([]);
  });

  it("never prunes the archive a restore is reading from", () => {
    // The regression. A safety backup taken at the cap evicts the oldest, and
    // the oldest is exactly what someone restoring reaches for.
    expect(backupsToPrune(eleven, "media-server-1.tar.gz")).toEqual([]);
  });

  it("still prunes when the protected archive is not the one at risk", () => {
    // Guards the guard: protecting something safe must not stop pruning
    // altogether, or the cap quietly stops applying.
    expect(backupsToPrune(eleven, "media-server-11.tar.gz")).toEqual([
      "media-server-1.tar.gz",
    ]);
  });
});

describe("archive member types", () => {
  it("accepts plain files and directories", () => {
    expect(() =>
      validateArchiveTypes([
        "-rw-r--r-- app/app     2 2026-10-21 10:13 db.sql",
        "drwxr-xr-x app/app     0 2026-10-21 10:13 uploads/",
        "",
      ]),
    ).not.toThrow();
  });

  it("refuses symlinks and hard links", () => {
    // A symlink member lets a later member be written through it to anywhere
    // the app can write; a hard link aliases a file the app can read.
    expect(() =>
      validateArchiveTypes(["lrwxrwxrwx app/app 0 2026-10-21 10:13 uploads/a -> /etc"]),
    ).toThrow(RestoreError);
    expect(() =>
      validateArchiveTypes(["hrw-r--r-- app/app 0 2026-10-21 10:13 uploads/a link to db.sql"]),
    ).toThrow(RestoreError);
  });
});

describe("dump meta-command check", () => {
  it("allows what pg_dump writes, including COPY data starting with a backslash", async () => {
    const dump = [
      "\\restrict abc123",
      "SET statement_timeout = 0;",
      "\\connect media",
      "COPY public.app_settings (key, value) FROM stdin;",
      "\\N\t{}",
      "\\\\leading-backslash\t{}",
      "\\.",
      "-- PostgreSQL database dump complete",
      "\\unrestrict abc123",
    ];
    expect(await findForbiddenMetaCommand(dump)).toBeNull();
  });

  it("refuses a shell escape or any other meta-command", async () => {
    expect(await findForbiddenMetaCommand(["SELECT 1;", "\\! rm -rf /"])).toBe("\\! rm -rf /");
    expect(await findForbiddenMetaCommand(["\\o /tmp/x"])).toBe("\\o /tmp/x");
    // Leaving COPY mode at `\.` means checking resumes after the data.
    expect(
      await findForbiddenMetaCommand([
        "COPY t (a) FROM stdin;",
        "1",
        "\\.",
        "\\! id",
      ]),
    ).toBe("\\! id");
  });
});

describe("pg environment", () => {
  it("moves every part of the URL into PG* variables, decoded", () => {
    expect(
      pgEnvFromUrl("postgres://us%40er:p%40ss%2Fw@db.example:6543/my_db?sslmode=require"),
    ).toEqual({
      PGHOST: "db.example",
      PGPORT: "6543",
      PGUSER: "us@er",
      PGPASSWORD: "p@ss/w",
      PGDATABASE: "my_db",
      PGSSLMODE: "require",
    });
  });

  it("refuses something that isn't a postgres URL", () => {
    expect(() => pgEnvFromUrl("mysql://x@y/z")).toThrow();
  });
});
