// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

/**
 * What a bulk run did, per item.
 *
 * Counted rather than thrown on: one unreachable item out of forty should not
 * abandon the other thirty-nine, but it should still be reported. Silently
 * skipping was the old behaviour, and it made a partial failure look identical
 * to a clean run.
 */
export type BulkResult = { ok: number; failed: number; skipped: number };

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * A one-line account of a bulk run, mentioning only what actually happened.
 *
 * Split out from the toast call so the wording has somewhere to be tested:
 * the interesting cases are the ones that are awkward to reach by hand — a
 * run where every item already had the tag, or where half of them failed.
 */
export function summariseBulk(result: BulkResult, verb: string): string {
  const parts = [`${verb} ${plural(result.ok, "item")}`];
  if (result.skipped > 0) parts.push(`${result.skipped} already had it`);
  if (result.failed > 0) parts.push(`${plural(result.failed, "item")} failed`);
  return parts.join(" · ");
}
