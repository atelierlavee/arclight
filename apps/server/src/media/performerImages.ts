// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PERFORMER_IMAGES_DIR } from "./cache.js";

export type PerformerImageKind = "avatar" | "banner";

// Bounded, never cropped — the same rule as banners. This used to crop a
// square at upload, on the reasoning that a circular avatar had nothing to
// reposition. Repositioning exists now, and cropping here made it useless:
// the pixels the drag needs had already been thrown away, so panning ran out
// of image almost immediately. Framing is a display decision; the stored file
// keeps the whole picture.
const AVATAR_MAX_SIZE = 1280;

// Banners are only bounded, never cropped. Keeping the full frame is what
// makes the drag-to-reposition control possible: the visible band is chosen
// at display time via CSS object-position, so it stays adjustable forever
// rather than being baked in at upload.
const BANNER_MAX_WIDTH = 1920;
const BANNER_MAX_HEIGHT = 1920;

const JPEG_QUALITY = 82;

/** Guards against a huge upload being buffered and decoded. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export function performerImagePath(fileName: string): string {
  return path.join(PERFORMER_IMAGES_DIR, fileName);
}

/**
 * Normalises an uploaded image and writes it to the performer-images cache,
 * returning the generated filename to store on the row.
 *
 * The random suffix means replacing an image always produces a new URL, so a
 * previously-cached copy in the browser can never mask the new one.
 */
export async function savePerformerImage(
  buffer: Buffer,
  performerId: number,
  kind: PerformerImageKind
): Promise<string> {
  await mkdir(PERFORMER_IMAGES_DIR, { recursive: true });

  const fileName = `${performerId}-${kind}-${randomBytes(6).toString("hex")}.jpg`;

  // .rotate() honours EXIF orientation before anything else measures the
  // image. sharp throws on input it can't decode, which is what rejects a
  // non-image wearing an image extension.
  const pipeline = sharp(buffer).rotate();

  // `inside` bounds the image without cropping and never enlarges a small
  // one, so the whole picture survives for repositioning.
  if (kind === "avatar") {
    pipeline.resize(AVATAR_MAX_SIZE, AVATAR_MAX_SIZE, {
      fit: "inside",
      withoutEnlargement: true,
    });
  } else {
    pipeline.resize(BANNER_MAX_WIDTH, BANNER_MAX_HEIGHT, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  await pipeline.jpeg({ quality: JPEG_QUALITY }).toFile(performerImagePath(fileName));

  return fileName;
}

/** Best-effort: a leftover file is clutter, not a correctness problem. */
export async function deletePerformerImage(fileName: string | null): Promise<void> {
  if (!fileName) return;
  try {
    await rm(performerImagePath(fileName), { force: true });
  } catch {
    // ignore — the row is what matters
  }
}
