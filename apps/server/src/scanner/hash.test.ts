// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { partialContentHash } from "./hash.js";

let dir: string;
const file = (name: string) => path.join(dir, name);

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "hash-test-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("partialContentHash", () => {
  it("gives identical content the same hash", async () => {
    await writeFile(file("a.bin"), "same content");
    await writeFile(file("b.bin"), "same content");
    const a = await partialContentHash(file("a.bin"), 12);
    const b = await partialContentHash(file("b.bin"), 12);
    expect(a).toBe(b);
  });

  it("gives different content different hashes", async () => {
    await writeFile(file("c.bin"), "content one");
    await writeFile(file("d.bin"), "content two");
    expect(await partialContentHash(file("c.bin"), 11)).not.toBe(
      await partialContentHash(file("d.bin"), 11)
    );
  });

  it("folds the size in, so same-prefix files of different lengths differ", async () => {
    // This is what stops a truncated copy hashing as the original.
    await writeFile(file("e.bin"), "prefix");
    await writeFile(file("f.bin"), "prefix-and-more");
    expect(await partialContentHash(file("e.bin"), 6)).not.toBe(
      await partialContentHash(file("f.bin"), 15)
    );
  });

  it("is stable across repeated calls", async () => {
    await writeFile(file("g.bin"), "stable");
    const first = await partialContentHash(file("g.bin"), 6);
    expect(await partialContentHash(file("g.bin"), 6)).toBe(first);
  });

  it("handles a file larger than the sampled window", async () => {
    // Over 1MB exercises the first+last chunk path rather than one read.
    const big = Buffer.alloc(3 * 1024 * 1024, "x");
    big.write("HEAD", 0);
    big.write("TAIL", big.length - 4);
    await writeFile(file("big.bin"), big);
    const hash = await partialContentHash(file("big.bin"), big.length);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("notices a change in the tail of a large file", async () => {
    // The middle is never read, but the tail must be — a re-encode that only
    // changes the end would otherwise look unchanged.
    const size = 3 * 1024 * 1024;
    const one = Buffer.alloc(size, "x");
    const two = Buffer.alloc(size, "x");
    two.write("DIFFERENT", size - 9);
    await writeFile(file("t1.bin"), one);
    await writeFile(file("t2.bin"), two);
    expect(await partialContentHash(file("t1.bin"), size)).not.toBe(
      await partialContentHash(file("t2.bin"), size)
    );
  });
});
