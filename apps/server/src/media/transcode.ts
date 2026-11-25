// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readdir, rename, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const SEGMENT_SECONDS = 4;
const MAX_ACTIVE_SESSIONS = 2;
const MAX_PARALLEL_ENCODERS = 2;
const MAX_SESSION_CACHE_BYTES = 256 * 1024 * 1024;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const SESSION_DIRECTORY_PREFIX = "arclight-transcode-";

type CachedSegment = { size: number; lastAccess: number };

type TranscodeSession = {
  id: string;
  itemId: number;
  profileId: number;
  sourcePath: string;
  durationSeconds: number;
  directory: string;
  segments: Map<number, CachedSegment>;
  inFlight: Map<number, Promise<string>>;
  processes: Set<ChildProcess>;
  closed: boolean;
  idleTimer: ReturnType<typeof setTimeout> | null;
  releaseSessionSlot: () => void;
};

const sessions = new Map<string, TranscodeSession>();
let reservedSessions = 0;
let activeEncoders = 0;
const encoderQueue: Array<() => void> = [];
let staleSweepTimer: ReturnType<typeof setInterval> | null = null;

export class TranscodeCapacityError extends Error {
  constructor() {
    super("The maximum number of active transcode sessions has been reached");
    this.name = "TranscodeCapacityError";
  }
}

function segmentCount(durationSeconds: number): number {
  return Math.ceil(durationSeconds / SEGMENT_SECONDS);
}

function segmentFilename(index: number): string {
  return `segment-${String(index).padStart(6, "0")}.ts`;
}

function scheduleIdleCleanup(session: TranscodeSession): void {
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => {
    void closeTranscodeSession(session.id).catch((error: unknown) => {
      console.warn(`transcode: cleanup failed for media item ${session.itemId}:`, error);
    });
  }, IDLE_TIMEOUT_MS);
  session.idleTimer.unref();
  void utimes(session.directory, new Date(), new Date()).catch((error: unknown) => {
    console.warn(`transcode: could not refresh session directory ${session.id}:`, error);
  });
}

async function acquireEncoder(): Promise<void> {
  if (activeEncoders < MAX_PARALLEL_ENCODERS && encoderQueue.length === 0) {
    activeEncoders += 1;
    return;
  }
  await new Promise<void>((resolve) => encoderQueue.push(resolve));
}

function releaseEncoder(): void {
  const next = encoderQueue.shift();
  if (next) next();
  else activeEncoders -= 1;
}

async function withEncoder<T>(work: () => Promise<T>): Promise<T> {
  await acquireEncoder();
  try {
    return await work();
  } finally {
    releaseEncoder();
  }
}

function ffmpegArgs(
  sourcePath: string,
  outputPath: string,
  startSeconds: number,
  durationSeconds: number,
): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-ss",
    startSeconds.toFixed(3),
    "-i",
    sourcePath,
    "-t",
    durationSeconds.toFixed(3),
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-sn",
    "-vf",
    "scale='min(1280,iw)':-2",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-threads",
    "2",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-avoid_negative_ts",
    "make_zero",
    "-f",
    "mpegts",
    outputPath,
  ];
}

async function encodeSegment(
  session: TranscodeSession,
  index: number,
  startSeconds: number,
  durationSeconds: number,
): Promise<string> {
  return withEncoder(async () => {
    if (session.closed) throw new Error("Transcode session has ended");

    const outputPath = path.join(session.directory, segmentFilename(index));
    const temporaryPath = path.join(
      session.directory,
      `.segment-${index}-${randomUUID()}.tmp.ts`,
    );

    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          "ffmpeg",
          ffmpegArgs(session.sourcePath, temporaryPath, startSeconds, durationSeconds),
          { stdio: ["ignore", "ignore", "pipe"] },
        );
        session.processes.add(child);
        let stderr = "";

        child.stderr?.on("data", (chunk: Buffer | string) => {
          stderr = `${stderr}${chunk.toString()}`.slice(-4000);
        });
        child.once("error", reject);
        child.once("close", (code, signal) => {
          if (code === 0) resolve();
          else reject(new Error(stderr.trim() || `FFmpeg exited with ${signal ?? `code ${code}`}`));
        });
        child.once("close", () => session.processes.delete(child));
      });

      if (session.closed) throw new Error("Transcode session has ended");
      const output = await stat(temporaryPath);
      if (output.size === 0) throw new Error("FFmpeg produced an empty segment");
      await rename(temporaryPath, outputPath);
      session.segments.set(index, { size: output.size, lastAccess: Date.now() });
      await pruneSessionCache(session, index);
      return outputPath;
    } finally {
      await rm(temporaryPath, { force: true });
    }
  });
}

async function pruneSessionCache(
  session: TranscodeSession,
  keepIndex: number,
): Promise<void> {
  let total = [...session.segments.values()].reduce((sum, segment) => sum + segment.size, 0);
  if (total <= MAX_SESSION_CACHE_BYTES) return;

  const oldest = [...session.segments.entries()]
    .filter(([index]) => index !== keepIndex)
    .sort((a, b) => a[1].lastAccess - b[1].lastAccess);
  for (const [index, segment] of oldest) {
    if (total <= MAX_SESSION_CACHE_BYTES) break;
    await rm(path.join(session.directory, segmentFilename(index)), { force: true });
    session.segments.delete(index);
    total -= segment.size;
  }
}

export async function removeStaleTranscodeDirectories(): Promise<void> {
  const entries = await readdir(tmpdir(), { withFileTypes: true });
  const cutoff = Date.now() - IDLE_TIMEOUT_MS;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(SESSION_DIRECTORY_PREFIX)) continue;
    const directory = path.join(tmpdir(), entry.name);
    try {
      const details = await stat(directory);
      if (details.mtimeMs < cutoff) {
        await rm(directory, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn(`transcode: could not sweep stale directory ${directory}:`, error);
    }
  }
}

export async function initializeTranscodeStorage(): Promise<void> {
  await removeStaleTranscodeDirectories();
  if (staleSweepTimer) return;
  staleSweepTimer = setInterval(() => {
    void removeStaleTranscodeDirectories().catch((error: unknown) => {
      console.warn("transcode: stale directory sweep failed:", error);
    });
  }, IDLE_TIMEOUT_MS);
  staleSweepTimer.unref();
}

export async function createTranscodeSession(
  itemId: number,
  profileId: number,
  sourcePath: string,
  durationSeconds: number,
): Promise<string> {
  if (reservedSessions >= MAX_ACTIVE_SESSIONS) throw new TranscodeCapacityError();
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("A positive video duration is required for transcoding");
  }
  reservedSessions += 1;
  let slotReleased = false;
  const releaseSessionSlot = () => {
    if (slotReleased) return;
    slotReleased = true;
    reservedSessions -= 1;
  };

  let directory: string | null = null;
  try {
    directory = await mkdtemp(path.join(tmpdir(), SESSION_DIRECTORY_PREFIX));
    const id = randomUUID();
    const session: TranscodeSession = {
      id,
      itemId,
      profileId,
      sourcePath,
      durationSeconds,
      directory,
      segments: new Map(),
      inFlight: new Map(),
      processes: new Set(),
      closed: false,
      idleTimer: null,
      releaseSessionSlot,
    };
    sessions.set(id, session);
    scheduleIdleCleanup(session);
    return id;
  } catch (error) {
    releaseSessionSlot();
    if (directory) await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export function getTranscodeSession(
  id: string,
  profileId: number,
): Pick<TranscodeSession, "itemId" | "sourcePath"> | null {
  const session = sessions.get(id);
  if (!session || session.profileId !== profileId || session.closed) return null;
  scheduleIdleCleanup(session);
  return { itemId: session.itemId, sourcePath: session.sourcePath };
}

export function transcodePlaylist(id: string, profileId: number): string | null {
  const session = sessions.get(id);
  if (!session || session.profileId !== profileId || session.closed) return null;
  scheduleIdleCleanup(session);

  const count = segmentCount(session.durationSeconds);
  const targetDuration = Math.ceil(
    Math.min(SEGMENT_SECONDS, session.durationSeconds),
  );
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-INDEPENDENT-SEGMENTS",
  ];

  for (let index = 0; index < count; index += 1) {
    if (index > 0) lines.push("#EXT-X-DISCONTINUITY");
    const duration = Math.min(
      SEGMENT_SECONDS,
      session.durationSeconds - index * SEGMENT_SECONDS,
    );
    lines.push(`#EXTINF:${duration.toFixed(3)},`, segmentFilename(index));
  }
  lines.push("#EXT-X-ENDLIST");
  return `${lines.join("\n")}\n`;
}

export async function transcodeAssetPath(
  id: string,
  profileId: number,
  asset: string,
): Promise<string | null> {
  const match = /^segment-(\d{6})\.ts$/.exec(asset);
  if (!match) return null;

  const session = sessions.get(id);
  if (!session || session.profileId !== profileId || session.closed) return null;
  scheduleIdleCleanup(session);

  const index = Number(match[1]);
  if (index >= segmentCount(session.durationSeconds)) return null;
  const outputPath = path.join(session.directory, segmentFilename(index));

  try {
    const details = await stat(outputPath);
    if (details.isFile() && details.size > 0) {
      session.segments.set(index, { size: details.size, lastAccess: Date.now() });
      return outputPath;
    }
  } catch {
    session.segments.delete(index);
  }

  const pending = session.inFlight.get(index);
  if (pending) return pending;

  const startSeconds = index * SEGMENT_SECONDS;
  const durationSeconds = Math.min(
    SEGMENT_SECONDS,
    session.durationSeconds - startSeconds,
  );
  const work = encodeSegment(session, index, startSeconds, durationSeconds).finally(() => {
    session.inFlight.delete(index);
  });
  session.inFlight.set(index, work);
  return work;
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 1500);
    child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

export async function closeTranscodeSession(
  id: string,
  profileId?: number,
): Promise<void> {
  const session = sessions.get(id);
  if (!session || (profileId !== undefined && session.profileId !== profileId)) return;

  sessions.delete(id);
  session.closed = true;
  if (session.idleTimer) clearTimeout(session.idleTimer);
  await Promise.all([...session.processes].map(stopChild));
  await Promise.allSettled([...session.inFlight.values()]);
  session.releaseSessionSlot();
  await rm(session.directory, { recursive: true, force: true });
}

export async function closeAllTranscodeSessions(): Promise<void> {
  await Promise.all([...sessions.keys()].map((id) => closeTranscodeSession(id)));
}
