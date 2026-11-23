// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

const COMPATIBLE_CODECS = new Set(["h264", "vp8", "vp9", "av1"]);

// ffprobe reports `format_name` as a comma-joined list of every format the
// demuxer matched — an MP4 comes back as "mov,mp4,m4a,3gp,3g2,mj2". So the
// check has to look for a playable name among those, not compare the whole
// string.
//
// "matroska,webm" is the awkward one: ffprobe uses a single joined name for
// both, so a real WebM and a real MKV are indistinguishable from format_name
// alone. Since WebM is the playable one and MKV isn't, the tie is broken by
// the codec — a Matroska file carrying VP8/VP9/AV1 is almost certainly WebM,
// while H.264 inside that demuxer is almost certainly a .mkv.
const COMPATIBLE_CONTAINERS = new Set(["mp4", "mov", "m4a", "webm", "3gp", "3g2"]);

const WEBM_CODECS = new Set(["vp8", "vp9", "av1"]);

function containerNames(containerFormat: string): string[] {
  return containerFormat
    .toLowerCase()
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * Whether a browser can play this container.
 *
 * Deliberately separate from the codec check: an MKV holding perfectly
 * ordinary H.264 passes on codec and still can't play, which used to mean a
 * silent black screen with no warning at all.
 */
function containerIsPlayable(containerFormat: string, codec: string | null): boolean {
  const names = containerNames(containerFormat);
  if (names.length === 0) return true; // nothing to judge on — don't cry wolf

  const ambiguousMatroska = names.includes("matroska") && names.includes("webm");
  if (ambiguousMatroska) {
    return codec !== null && WEBM_CODECS.has(codec);
  }

  return names.some((name) => COMPATIBLE_CONTAINERS.has(name));
}

/**
 * A message explaining why a file won't direct-play, or null when it will.
 *
 * Names the actual problem — container or codec — because they need different
 * fixes and the wrong one sends you down the wrong path. A container problem
 * is solved by remuxing (fast, lossless); a codec problem needs a full
 * re-encode.
 */
export function playbackWarningFor(
  itemType: string,
  extraMetadata: Record<string, unknown> | null
): string | null {
  if (itemType !== "video") return null;

  const rawCodec = extraMetadata?.codec;
  const codec = typeof rawCodec === "string" ? rawCodec.toLowerCase() : null;

  const rawContainer = extraMetadata?.containerFormat;
  const container = typeof rawContainer === "string" ? rawContainer : null;

  const codecOk = codec === null || COMPATIBLE_CODECS.has(codec);
  const containerOk = container === null || containerIsPlayable(container, codec);

  if (codecOk && containerOk) return null;

  if (!codecOk && !containerOk) {
    return `This video's format (${codec} in ${container}) can't play in a browser. Converting it to H.264 in an MP4 would fix it.`;
  }
  if (!codecOk) {
    return `This video's codec (${codec}) can't play in a browser. Converting it to H.264 would fix it.`;
  }
  return `This video's container (${container}) can't play in a browser, though its codec is fine — repackaging it as MP4 would fix it without re-encoding.`;
}
