// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { getScanSettings } from "../api/settings.js";
import { isRestoring } from "../backup/restoreState.js";
import { isScanRunning, startScan } from "./pipeline.js";

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Runs a library scan on an interval, so files dropped into a watched folder
 * appear without pressing Rescan.
 *
 * Deliberately a timer rather than a filesystem watcher. The media folders are
 * Docker bind mounts from macOS, and host-side writes raise no inotify events
 * inside the container — the same reason `tsx watch` never sees host edits to
 * the source mount. chokidar would hit the identical wall, and its polling
 * fallback stats every file on every tick, which costs the same as a scan
 * while adding a dependency and a second code path.
 *
 * Safe to repeat: the scanner reconciles rather than re-imports. Unchanged
 * files short-circuit on size and mtime, and the title/performer/studio syncs
 * each no-op once they already agree.
 */
async function tick(): Promise<void> {
  // startScan throws when one is already running, and an unhandled rejection
  // inside setInterval would take the process down rather than skip a beat.
  if (isScanRunning()) return;
  // A restore drops and recreates every table. The HTTP gate cannot see a
  // setInterval, so the check has to live here too — otherwise a scan that
  // happens to fire mid-restore inserts a job row into a table being dropped,
  // and blocks the DROP itself while it does.
  if (isRestoring()) return;
  try {
    await startScan();
  } catch {
    // A scan that raced us to the slot, or failed to start. The job row records
    // real failures; there's nothing useful to do from the timer.
  }
}

export async function startScanSchedule(): Promise<void> {
  const { intervalMinutes } = await getScanSettings();
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (intervalMinutes <= 0) return; // "Off"

  timer = setInterval(() => void tick(), intervalMinutes * 60_000);
  // Don't hold the process open on shutdown for a scan that hasn't fired.
  timer.unref?.();
}

/**
 * Disarms the timer entirely.
 *
 * Belt and braces alongside the isRestoring() check in tick(): a scan already
 * past that check cannot be recalled, so a restore stops the clock as well as
 * gating the beat, then calls restartScanSchedule() when it is done.
 */
export function stopScanSchedule(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

/** Re-reads the setting and re-arms, so a change applies without a restart. */
export async function restartScanSchedule(): Promise<void> {
  await startScanSchedule();
}
