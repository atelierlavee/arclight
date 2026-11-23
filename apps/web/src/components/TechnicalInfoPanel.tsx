// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import type { MediaItemDetail, PhotoMetadata } from "@/lib/mediaItemApi";

function formatCoords(gps: { latitude: number; longitude: number }): string {
  return `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}`;
}

/**
 * Date only — the time a file was written is noise at this granularity.
 *
 * A bare "YYYY-MM-DD" (what the release date is) is parsed by JS as UTC
 * midnight and then rendered in local time, which displays the *previous* day
 * anywhere west of Greenwich. Appending a local time forces it to be read in
 * the viewer's own zone, so the date shown is the date stored.
 */
function formatDate(value: string): string {
  const localised = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  return new Date(localised).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatSize(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

export function TechnicalInfoPanel({ item }: { item: MediaItemDetail }) {
  if (item.itemType === "folder") return null;

  const rows: [string, string][] = [];

  if (item.itemType === "video") {
    // Resolution, codec and size are gone deliberately: they describe the
    // file, not the scene, and none of them change what you'd choose to
    // watch. The playback warning below still surfaces a codec or container
    // problem, which is the only moment that detail actually matters.
    //
    // The release date is the one date shown. The file's mtime and the date
    // the library first saw it are facts about the filing, and showing three
    // dates made the one that mattered hard to find. Absent rather than
    // guessed when the filename doesn't carry one.
    if (item.releaseDate) rows.push(["Released", formatDate(item.releaseDate)]);
    if (item.playCount > 0) {
      rows.push(["Plays", item.playCount === 1 ? "1 time" : `${item.playCount} times`]);
    }
    if (item.watchedAt) rows.push(["Finished", formatDate(item.watchedAt)]);
  } else {
    const meta = (item.extraMetadata ?? {}) as PhotoMetadata;
    if (meta.cameraModel) rows.push(["Camera", meta.cameraModel]);
    if (meta.gps) rows.push(["Location", formatCoords(meta.gps)]);
    if (item.takenAt) rows.push(["Taken", new Date(item.takenAt).toLocaleString()]);
    if (item.fileSizeBytes) rows.push(["Size", formatSize(item.fileSizeBytes)]);
    rows.push(["Added", formatDate(item.createdAt)]);
  }

  if (rows.length === 0) return null;

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
