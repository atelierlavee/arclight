// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type VideoProbeResult = {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
  containerFormat: string | null;
  embeddedTitle: string | null;
  /** Overall bitrate in kilobits per second, container-reported. */
  bitrateKbps: number | null;
};

type FfprobeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
};

type FfprobeOutput = {
  format?: {
    duration?: string;
    format_name?: string;
    bit_rate?: string;
    tags?: { title?: string };
  };
  streams?: FfprobeStream[];
};

// ffprobe reads headers, not the stream, so a healthy file answers in well
// under a second. One that hasn't answered in this long is stuck — typically a
// damaged file or a network mount that stopped responding — and with no limit
// it pinned one of the scan's few concurrency slots for good. SIGKILL because
// a process blocked on I/O from a dead mount ignores SIGTERM.
const PROBE_TIMEOUT_MS = 30_000;

const EMPTY_RESULT: VideoProbeResult = {
  durationSeconds: null,
  width: null,
  height: null,
  codec: null,
  containerFormat: null,
  embeddedTitle: null,
  bitrateKbps: null,
};

/** What the scan stores in media_items.extra_metadata for a probed video. */
export function probeMetadata(probe: VideoProbeResult) {
  return {
    width: probe.width,
    height: probe.height,
    codec: probe.codec,
    containerFormat: probe.containerFormat,
    embeddedTitle: probe.embeddedTitle,
    // Always present once probed, null when the container doesn't say, so
    // "not probed yet" and "probed, unknown" can be told apart.
    bitrateKbps: probe.bitrateKbps,
  };
}

export async function probeVideo(filePath: string): Promise<VideoProbeResult> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ], { timeout: PROBE_TIMEOUT_MS, killSignal: "SIGKILL" });

    const data = JSON.parse(stdout) as FfprobeOutput;
    const videoStream = data.streams?.find((s) => s.codec_type === "video");
    const duration = data.format?.duration ? Number(data.format.duration) : null;

    return {
      durationSeconds: duration !== null && !Number.isNaN(duration) ? Math.round(duration) : null,
      width: videoStream?.width ?? null,
      height: videoStream?.height ?? null,
      codec: videoStream?.codec_name ?? null,
      containerFormat: data.format?.format_name ?? null,
      embeddedTitle: data.format?.tags?.title ?? null,
      bitrateKbps: parseBitrateKbps(data.format?.bit_rate),
    };
  } catch {
    return EMPTY_RESULT;
  }
}

function parseBitrateKbps(raw: string | undefined): number | null {
  const bitsPerSecond = raw === undefined ? NaN : Number(raw);
  // Capped well past any real file: the value is compared against an integer.
  return Number.isFinite(bitsPerSecond) && bitsPerSecond > 0
    ? Math.min(Math.round(bitsPerSecond / 1000), 10_000_000)
    : null;
}
