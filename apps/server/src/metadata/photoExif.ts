// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import exifr from "exifr";

export type PhotoExifResult = {
  takenAt: Date | null;
  cameraModel: string | null;
  gps: { latitude: number; longitude: number } | null;
};

const EMPTY_RESULT: PhotoExifResult = {
  takenAt: null,
  cameraModel: null,
  gps: null,
};

export async function probePhoto(filePath: string): Promise<PhotoExifResult> {
  try {
    const data = await exifr.parse(filePath, { gps: true });
    if (!data) return EMPTY_RESULT;

    const takenAt: Date | null = data.DateTimeOriginal ?? data.CreateDate ?? null;
    const cameraModel: string | null = data.Model ?? null;
    const gps =
      typeof data.latitude === "number" && typeof data.longitude === "number"
        ? { latitude: data.latitude, longitude: data.longitude }
        : null;

    return { takenAt, cameraModel, gps };
  } catch {
    return EMPTY_RESULT;
  }
}
