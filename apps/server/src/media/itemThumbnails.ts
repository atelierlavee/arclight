// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ITEM_THUMBNAILS_DIR } from "./cache.js";

// Matches the shape of a generated poster, so an uploaded thumbnail drops
// into the same 16:9 tiles without the layout shifting.
const WIDTH = 1920;
const HEIGHT = 1080;
const JPEG_QUALITY = 85;

export function itemThumbnailPath(fileName: string): string {
  return path.join(ITEM_THUMBNAILS_DIR, fileName);
}

/**
 * Normalises an uploaded image and returns the filename to store on the row.
 *
 * The random suffix is what makes replacing a thumbnail visible immediately:
 * the served URL carries it, so a new upload is a different URL and the
 * browser can't hand back the year-old cached copy.
 */
export async function saveItemThumbnail(buffer: Buffer, mediaItemId: number): Promise<string> {
  await mkdir(ITEM_THUMBNAILS_DIR, { recursive: true });

  const fileName = `${mediaItemId}-${randomBytes(6).toString("hex")}.jpg`;

  // sharp throws on anything it can't decode, which is what rejects a
  // non-image wearing an image extension.
  await sharp(buffer)
    .rotate() // honour EXIF orientation before cropping
    // Bounded, not cropped: `cover` would bake a crop in at upload and leave
    // the framing control with nothing left to pan across. WIDTH and HEIGHT
    // are a bounding box now, not a target shape.
    .resize(WIDTH, HEIGHT, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(itemThumbnailPath(fileName));

  return fileName;
}

/** Best-effort: a leftover file is clutter, not a correctness problem. */
export async function deleteItemThumbnail(fileName: string | null): Promise<void> {
  if (!fileName) return;
  try {
    await rm(itemThumbnailPath(fileName), { force: true });
  } catch {
    // ignore — the row is what matters
  }
}
