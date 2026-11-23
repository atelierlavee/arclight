// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { walk } from "./walk.js";

let dir: string;

async function collect(root: string): Promise<string[]> {
  const found: string[] = [];
  for await (const file of walk(root)) found.push(path.relative(root, file));
  return found.sort();
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "walk-test-"));
  await mkdir(path.join(dir, "Alice/Vixen"), { recursive: true });
  await writeFile(path.join(dir, "root.mp4"), "");
  await writeFile(path.join(dir, "Alice/a.mp4"), "");
  await writeFile(path.join(dir, "Alice/Vixen/b.mp4"), "");
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("walk", () => {
  it("yields every file at every depth", async () => {
    expect(await collect(dir)).toEqual([
      "Alice/Vixen/b.mp4",
      "Alice/a.mp4",
      "root.mp4",
    ]);
  });

  it("returns nothing for a directory that does not exist, rather than throwing", async () => {
    // An unreadable or unmounted root must not abort the whole scan.
    await expect(collect(path.join(dir, "missing"))).resolves.toEqual([]);
  });

  it("skips symlinks entirely", async () => {
    // Documented behaviour rather than a preference: a symlink is neither
    // isFile() nor isDirectory(), so it falls through both branches. This is
    // why symlinking one file into two folders does not work.
    const linked = await mkdtemp(path.join(tmpdir(), "walk-link-"));
    await writeFile(path.join(linked, "real.mp4"), "");
    await symlink(path.join(linked, "real.mp4"), path.join(linked, "link.mp4"));
    expect(await collect(linked)).toEqual(["real.mp4"]);
    await rm(linked, { recursive: true, force: true });
  });
});
