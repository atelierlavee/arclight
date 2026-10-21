import { parseDeclaredName } from "./performerNames.js";

export type MediaKind = "video" | "photo";

const VIDEO_MIME_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  mov: "video/quicktime",
  webm: "video/webm",
  m4v: "video/x-m4v",
  // F4V is ISO-BMFF — the same container as MP4, just Adobe's extension for
  // it (ffprobe reports its format as "mov,mp4,m4a,3gp,3g2,mj2"). Serving it
  // as video/mp4 rather than its own type is deliberate: browsers decode it
  // with the MP4 demuxer, but some refuse on an unrecognised MIME type.
  f4v: "video/mp4",
  // WMV is ASF, typically holding VC-1 video and WMA audio — none of which
  // any current browser can decode. Scanning, metadata, poster frames and
  // preview clips all work regardless (ffmpeg decodes it fine, and previews
  // are re-encoded to H.264), so these files are worth cataloguing; the
  // codec allow-list in media/compatibility.ts is what warns that it won't
  // play. There will never be a transcoding fallback: the app is MP4-only
  // for playback by design (README → Formats).
  wmv: "video/x-ms-wmv",
};

const PHOTO_MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
};

function extname(filePath: string): string | null {
  const base = filePath.split("/").pop() ?? filePath;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  return base.slice(dot + 1).toLowerCase();
}

export function classifyByExtension(filePath: string): MediaKind | null {
  const ext = extname(filePath);
  if (!ext) return null;
  if (ext in VIDEO_MIME_TYPES) return "video";
  if (ext in PHOTO_MIME_TYPES) return "photo";
  return null;
}

export function mimeTypeFor(filePath: string): string {
  const ext = extname(filePath);
  if (!ext) return "application/octet-stream";
  return VIDEO_MIME_TYPES[ext] ?? PHOTO_MIME_TYPES[ext] ?? "application/octet-stream";
}

export function titleFromFilename(filePath: string): string {
  // A filename following the declared convention already says where its title
  // starts, so use that rather than scrubbing the whole string — otherwise the
  // studio and the cast end up in the title.
  const declared = parseDeclaredName(filePath);
  if (declared?.title) return declared.title;

  const base = filePath.split("/").pop() ?? filePath;
  const withoutExt = base.replace(/\.[^./]+$/, "");
  return withoutExt.replace(/[_-]+/g, " ").trim();
}
