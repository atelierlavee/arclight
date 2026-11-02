import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Subtitles that sit beside a video: `movie.mp4` with `movie.srt`,
 * `movie.vtt`, or `movie.en.srt` for a language.
 *
 * Found by reading the video's folder when asked rather than recorded by the
 * scan, so a subtitle dropped in next to a video works straight away and one
 * removed stops being offered, with nothing to keep in step. The video file is
 * never touched: an SRT is converted to WebVTT (a different text format, which
 * is all browsers play) as it is served.
 */

export type SubtitleTrack = {
  /** Position in the sorted list; the URL names a track by this, never by a file name. */
  index: number;
  /** BCP 47 tag from the file name (`en`, `pt-BR`), or null when it names none. */
  language: string | null;
  /** "English", "English (forced)", or "Subtitles" for an unnamed track. */
  label: string;
  /** Absolute path, server side only. */
  file: string;
};

/** Larger than any real subtitle file; anything bigger is not one. */
export const MAX_SUBTITLE_BYTES = 2 * 1024 * 1024;

const SUBTITLE_EXTENSIONS = [".vtt", ".srt"];
const LANGUAGE_TAG = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i;
const FLAGS = new Set(["forced", "sdh", "cc", "hi", "default"]);

/** A language's name in English, or the tag itself when it isn't a known one. */
export function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/**
 * What a file name adds after the video's name: `.en.forced` is language `en`
 * and a `forced` flag; `.srt` alone is neither. Returns null when the file
 * doesn't belong to this video at all.
 */
export function parseSubtitleName(
  videoName: string,
  fileName: string,
): { language: string | null; flags: string[]; extension: string } | null {
  const extension = path.extname(fileName).toLowerCase();
  if (!SUBTITLE_EXTENSIONS.includes(extension)) return null;

  const stem = fileName.slice(0, fileName.length - extension.length);
  const videoStem = videoName.slice(0, videoName.length - path.extname(videoName).length);
  // Case-insensitive: the video and its subtitle are often named by different tools.
  if (stem.toLowerCase() === videoStem.toLowerCase()) {
    return { language: null, flags: [], extension };
  }
  if (!stem.toLowerCase().startsWith(`${videoStem.toLowerCase()}.`)) return null;

  const suffix = stem.slice(videoStem.length + 1).split(".").filter(Boolean);
  let language: string | null = null;
  const flags: string[] = [];
  for (const part of suffix) {
    if (FLAGS.has(part.toLowerCase())) flags.push(part.toLowerCase());
    else if (language === null && LANGUAGE_TAG.test(part)) language = part;
    else return null; // something else — a different video's name that shares a prefix
  }
  return { language, flags, extension };
}

/** The subtitle tracks beside `videoPath`, in a stable order. */
export async function listSubtitleTracks(videoPath: string): Promise<SubtitleTrack[]> {
  const directory = path.dirname(videoPath);
  const videoName = path.basename(videoPath);

  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return [];
  }

  // One file per language-and-flags combination, a .vtt winning over a .srt
  // so a folder holding both of one subtitle doesn't offer it twice.
  const chosen = new Map<string, { name: string; language: string | null; flags: string[]; extension: string }>();
  for (const name of names.sort()) {
    const parsed = parseSubtitleName(videoName, name);
    if (!parsed) continue;
    const key = `${parsed.language?.toLowerCase() ?? ""}|${parsed.flags.join(",")}`;
    const existing = chosen.get(key);
    if (!existing || (existing.extension === ".srt" && parsed.extension === ".vtt")) {
      chosen.set(key, { name, ...parsed });
    }
  }

  const entries = [...chosen.values()].sort(
    (a, b) =>
      (a.language ?? "").localeCompare(b.language ?? "") ||
      a.flags.join(",").localeCompare(b.flags.join(",")) ||
      a.name.localeCompare(b.name),
  );

  const tracks: SubtitleTrack[] = [];
  for (const entry of entries) {
    const base = entry.language ? languageName(entry.language) : "Subtitles";
    const label = entry.flags.length > 0 ? `${base} (${entry.flags.join(", ")})` : base;
    tracks.push({
      index: tracks.length,
      language: entry.language,
      label,
      file: path.join(directory, entry.name),
    });
  }
  return tracks;
}

/**
 * A subtitle file as WebVTT text.
 *
 * An SRT differs from VTT in a header line and in writing the milliseconds
 * after a comma; the rest (cue numbers, `<i>` and `<b>`) VTT accepts as is.
 * ASS-style `{\an8}` positioning tags are dropped, as VTT would show them as
 * text. Returns null for a file that is missing or too large to be one.
 */
export async function readSubtitleAsVtt(file: string): Promise<string | null> {
  let bytes: Buffer;
  try {
    if ((await stat(file)).size > MAX_SUBTITLE_BYTES) return null;
    bytes = await readFile(file);
  } catch {
    return null;
  }
  return toVtt(decodeSubtitle(bytes), path.extname(file).toLowerCase() === ".srt");
}

/** UTF-8 when the bytes are valid UTF-8, otherwise Windows-1252, which older files use. */
export function decodeSubtitle(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function toVtt(text: string, isSrt: boolean): string {
  const normalised = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!isSrt) {
    return normalised.startsWith("WEBVTT") ? `${normalised}\n` : `WEBVTT\n\n${normalised}\n`;
  }
  const body = normalised
    .split("\n")
    .map((line) =>
      line.includes("-->")
        ? line.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g, "$1.$2")
        : line.replace(/\{\\[^}]*\}/g, ""),
    )
    .join("\n");
  return `WEBVTT\n\n${body}\n`;
}
