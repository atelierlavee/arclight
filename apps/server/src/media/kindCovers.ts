// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { KIND_COVERS_DIR } from "./cache.js";

// The tiles are roughly 3:1, but storing at 16:9 keeps the image useful if
// that ratio ever changes — object-cover crops the rest at display time.
const WIDTH = 1280;
const HEIGHT = 720;
const JPEG_QUALITY = 82;

export function kindCoverPath(fileName: string): string {
  return path.join(KIND_COVERS_DIR, fileName);
}

/**
 * Normalises an uploaded cover and returns the filename to record.
 *
 * The random suffix means replacing a cover changes its URL, so a browser
 * can't serve the previous one from cache.
 */
export async function saveKindCover(buffer: Buffer, kind: string): Promise<string> {
  await mkdir(KIND_COVERS_DIR, { recursive: true });
  const fileName = `${kind}-${randomBytes(6).toString("hex")}.jpg`;

  // sharp throws on anything it can't decode, which is what rejects a
  // non-image wearing an image extension.
  await sharp(buffer)
    .rotate()
    // Bounded, not cropped: `cover` would bake a crop in at upload and leave
    // the framing control with nothing left to pan across. WIDTH and HEIGHT
    // are a bounding box now, not a target shape.
    .resize(WIDTH, HEIGHT, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(kindCoverPath(fileName));

  return fileName;
}

export async function deleteKindCover(fileName: string | null | undefined): Promise<void> {
  if (!fileName) return;
  try {
    await rm(kindCoverPath(fileName), { force: true });
  } catch {
    // Best-effort: a leftover file is clutter, not a correctness problem.
  }
}
