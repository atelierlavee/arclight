// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { getSizedThumbnail, thumbnailSizeFor } from "./thumbnails.js";

async function poster(width: number, height: number): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "sized-thumb-"));
  const file = path.join(dir, `1-${width}x${height}.jpg`);
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 120 } },
  })
    .jpeg()
    .toBuffer();
  await writeFile(file, buffer);
  return file;
}

describe("thumbnailSizeFor", () => {
  it("snaps up to the next size step", () => {
    expect(thumbnailSizeFor("100")).toBe(320);
    expect(thumbnailSizeFor("320")).toBe(320);
    expect(thumbnailSizeFor("500")).toBe(640);
    expect(thumbnailSizeFor("900")).toBe(960);
  });

  it("means full size past the last step, and for anything that isn't a width", () => {
    for (const raw of ["1200", undefined, "", "abc", "-5", "0"]) {
      expect(thumbnailSizeFor(raw)).toBeNull();
    }
  });
});

describe("getSizedThumbnail", () => {
  it("scales a full-size poster down to the width asked for", async () => {
    const source = await poster(1920, 1080);
    const sized = await getSizedThumbnail(source, 640);
    expect(sized).not.toBe(source);
    const meta = await sharp(sized).metadata();
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(360);
  });

  it("reuses the copy it made", async () => {
    const source = await poster(1920, 1080);
    expect(await getSizedThumbnail(source, 320)).toBe(await getSizedThumbnail(source, 320));
  });

  it("never enlarges a picture smaller than the width", async () => {
    const source = await poster(400, 225);
    const meta = await sharp(await getSizedThumbnail(source, 960)).metadata();
    expect(meta.width).toBe(400);
  });

  it("falls back to the original when it can't be read", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sized-thumb-"));
    const broken = path.join(dir, "broken.jpg");
    await writeFile(broken, "not an image");
    expect(await getSizedThumbnail(broken, 320)).toBe(broken);
  });
});
