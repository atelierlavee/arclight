// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  decodeSubtitle,
  listSubtitleTracks,
  parseSubtitleName,
  readSubtitleAsVtt,
  toVtt,
} from "./subtitles.js";

describe("parseSubtitleName", () => {
  it("matches the video's own name, with or without a language", () => {
    expect(parseSubtitleName("Movie.mp4", "Movie.srt")).toEqual({ language: null, flags: [], extension: ".srt" });
    expect(parseSubtitleName("Movie.mp4", "Movie.en.srt")).toEqual({ language: "en", flags: [], extension: ".srt" });
    expect(parseSubtitleName("Movie.mp4", "movie.PT-br.vtt")).toEqual({ language: "PT-br", flags: [], extension: ".vtt" });
    expect(parseSubtitleName("Movie.mp4", "Movie.en.forced.srt")).toEqual({ language: "en", flags: ["forced"], extension: ".srt" });
  });

  it("refuses other videos, other extensions and look-alike names", () => {
    expect(parseSubtitleName("Movie.mp4", "Movie 2.srt")).toBeNull();
    expect(parseSubtitleName("Movie.mp4", "Movie.Part.Two.srt")).toBeNull();
    expect(parseSubtitleName("Movie.mp4", "Other.srt")).toBeNull();
    expect(parseSubtitleName("Movie.mp4", "Movie.ass")).toBeNull();
    expect(parseSubtitleName("Movie.mp4", "Movie.mp4")).toBeNull();
  });
});

describe("toVtt", () => {
  it("converts an SRT: header, millisecond separator, positioning tags", () => {
    const srt = "﻿1\r\n00:00:01,000 --> 00:00:02,500\r\n{\\an8}<i>Hello,</i> world\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nBye\r\n";
    expect(toVtt(srt, true)).toBe(
      "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500\n<i>Hello,</i> world\n\n2\n00:00:03.000 --> 00:00:04.000\nBye\n",
    );
  });

  it("leaves commas in the text alone and keeps a VTT's own header", () => {
    expect(toVtt("1\n00:00:01,000 --> 00:00:02,000\nYes, 12:00:00,5\n", true)).toContain("Yes, 12:00:00,5");
    expect(toVtt("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi", false)).toBe("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n");
    expect(toVtt("00:00:01.000 --> 00:00:02.000\nHi", false).startsWith("WEBVTT\n\n")).toBe(true);
  });

  it("decodes UTF-8, falling back to Windows-1252", () => {
    expect(decodeSubtitle(Buffer.from("café", "utf8"))).toBe("café");
    expect(decodeSubtitle(Buffer.from([0x63, 0x61, 0x66, 0xe9]))).toBe("café");
  });
});

describe("listSubtitleTracks", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "subs-"));
    await mkdir(path.join(dir, "nested"));
    for (const name of [
      "Movie.mp4",
      "Movie.en.srt",
      "Movie.fr.vtt",
      "Movie.fr.srt",
      "Movie.srt",
      "Movie 2.srt",
      "Other.en.srt",
    ]) {
      await writeFile(path.join(dir, name), "1\n00:00:01,000 --> 00:00:02,000\nx\n");
    }
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("lists this video's tracks only, in a stable order, a .vtt beating a .srt", async () => {
    const tracks = await listSubtitleTracks(path.join(dir, "Movie.mp4"));
    expect(tracks.map((t) => [t.index, t.language, t.label, path.basename(t.file)])).toEqual([
      [0, null, "Subtitles", "Movie.srt"],
      [1, "en", "English", "Movie.en.srt"],
      [2, "fr", "French", "Movie.fr.vtt"],
    ]);
  });

  it("is empty for a folder that is gone or has none", async () => {
    expect(await listSubtitleTracks(path.join(dir, "missing", "x.mp4"))).toEqual([]);
    expect(await listSubtitleTracks(path.join(dir, "Lonely.mp4"))).toEqual([]);
  });

  it("serves a track as VTT and refuses a missing file", async () => {
    expect(await readSubtitleAsVtt(path.join(dir, "Movie.en.srt"))).toContain("00:00:01.000 --> 00:00:02.000");
    expect(await readSubtitleAsVtt(path.join(dir, "gone.srt"))).toBeNull();
  });
});
