import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checksumDirectory, sha256File } from "./create.js";
import {
  compareChecksums,
  DUMP_TERMINATOR,
  isDumpComplete,
} from "./verify.js";

/**
 * The parts of verification with a decision in them.
 *
 * The surrounding routine shells out to tar, which the host running
 * `npm test` may not have — so as with restore.test.ts, what is guarded here
 * is what decides whether a backup is trustworthy, not the orchestration.
 */
describe("isDumpComplete", () => {
  it("accepts a dump that ends the way pg_dump ends one", () => {
    expect(isDumpComplete(`CREATE TABLE x ();\n${DUMP_TERMINATOR}\n`)).toBe(true);
  });

  it("tolerates trailing whitespace", () => {
    expect(isDumpComplete(`${DUMP_TERMINATOR}\n\n  \n`)).toBe(true);
  });

  // The failure this whole routine exists for: a dump cut short by a full
  // disk extracts perfectly and restores into a half-populated database
  // without erroring.
  it("rejects a dump cut off mid-statement", () => {
    expect(isDumpComplete("CREATE TABLE x (\nid integer,\n")).toBe(false);
  });

  it("accepts the trailer real pg_dump output carries after the terminator", () => {
    // pg_dump closes its banner with a bare `--`, and from 17.6 / 18 adds an
    // `\unrestrict` line after it. Checking the raw tail failed every real
    // dump as "truncated".
    expect(
      isDumpComplete(
        `CREATE TABLE x ();\n--\n${DUMP_TERMINATOR}\n--\n\n\\unrestrict AbC123\n`,
      ),
    ).toBe(true);
    expect(
      isDumpComplete(`--\n${DUMP_TERMINATOR}\n--\n\n`),
    ).toBe(true);
  });

  it("rejects an empty file", () => {
    expect(isDumpComplete("")).toBe(false);
  });

  // The terminator has to be at the end, not merely present — a dump that
  // continued past it was not written by one pg_dump run.
  it("rejects a dump with content after the terminator", () => {
    expect(isDumpComplete(`${DUMP_TERMINATOR}\nDROP TABLE x;`)).toBe(false);
  });
});

describe("compareChecksums", () => {
  it("finds nothing wrong when every file matches", () => {
    expect(compareChecksums({ "db.sql": "a" }, { "db.sql": "a" })).toEqual({
      missing: [],
      mismatched: [],
    });
  });

  // Different causes and different recoveries, so they must not be confused.
  it("tells a missing file from an altered one", () => {
    expect(
      compareChecksums(
        { "db.sql": "a", "uploads/x.jpg": "b" },
        { "db.sql": "changed" },
      ),
    ).toEqual({ missing: ["uploads/x.jpg"], mismatched: ["db.sql"] });
  });

  // An extra file is not a fault: the manifest says what must be there, not
  // what may not be.
  it("ignores files the manifest never claimed", () => {
    expect(compareChecksums({}, { "stray.txt": "a" })).toEqual({
      missing: [],
      mismatched: [],
    });
  });
});

describe("checksumDirectory", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "verify-test-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("hashes every file, keyed by its path inside the archive", async () => {
    await writeFile(path.join(dir, "db.sql"), "hello");
    await mkdir(path.join(dir, "uploads", "kind-covers"), { recursive: true });
    await writeFile(path.join(dir, "uploads", "kind-covers", "a.jpg"), "image");

    const sums = await checksumDirectory(dir);
    expect(Object.keys(sums).sort()).toEqual([
      "db.sql",
      "uploads/kind-covers/a.jpg",
    ]);
    // sha256("hello")
    expect(sums["db.sql"]).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  // meta.json is written after the checksums are taken and cannot contain its
  // own hash, so it must never be a member of the map — re-running over an
  // unpacked archive would otherwise report a mismatch for a file that was
  // never covered.
  it("never hashes the manifest itself", async () => {
    await writeFile(path.join(dir, "meta.json"), "{}");
    await writeFile(path.join(dir, "db.sql"), "x");
    expect(Object.keys(await checksumDirectory(dir))).toEqual(["db.sql"]);
  });

  it("returns nothing for a directory that isn't there", async () => {
    expect(await checksumDirectory(path.join(dir, "nope"))).toEqual({});
  });

  it("gives different content different hashes", async () => {
    await writeFile(path.join(dir, "a"), "one");
    await writeFile(path.join(dir, "b"), "two");
    const sums = await checksumDirectory(dir);
    expect(sums.a).not.toBe(sums.b);
    expect(sums.a).toBe(await sha256File(path.join(dir, "a")));
  });
});
