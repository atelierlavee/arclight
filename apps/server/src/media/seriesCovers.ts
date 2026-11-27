// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { SERIES_COVERS_DIR } from "./cache.js";

// Any shape — portrait box art as much as a wide still — kept whole and
// shown whole: bounded on its longer side, never cropped.
const WIDTH = 1600;
const HEIGHT = 1600;
const JPEG_QUALITY = 84;

export function seriesCoverPath(fileName: string): string {
  return path.join(SERIES_COVERS_DIR, fileName);
}

/**
 * Normalises an uploaded series cover and returns the filename to record.
 * The random suffix means a replaced cover gets a new URL, so a browser
 * can't keep showing the old one from cache.
 */
export async function saveSeriesCover(buffer: Buffer, seriesId: number): Promise<string> {
  await mkdir(SERIES_COVERS_DIR, { recursive: true });
  const fileName = `${seriesId}-${randomBytes(6).toString("hex")}.jpg`;
  // sharp throws on anything it can't decode: a non-image is rejected here.
  await sharp(buffer)
    .rotate()
    .resize(WIDTH, HEIGHT, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(seriesCoverPath(fileName));
  return fileName;
}

export async function deleteSeriesCover(fileName: string | null | undefined): Promise<void> {
  if (!fileName) return;
  try {
    await rm(seriesCoverPath(fileName), { force: true });
  } catch {
    // Best-effort: a leftover file is clutter, not a correctness problem.
  }
}
