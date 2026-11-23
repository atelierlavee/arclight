// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

/**
 * The phrase someone has to type to confirm a restore.
 *
 * The archive's own date, taken from its filename. Deliberately not a fixed
 * word like "RESTORE": typing that proves only that you can read the dialog,
 * whereas the date is the one detail worth being sure about — restoring the
 * wrong archive destroys just as much as restoring none.
 *
 * Backup names are `media-server-<ISO with colons replaced by dashes>.tar.gz`.
 */
export function restoreConfirmPhrase(name: string): string {
  const match = /^media-server-(\d{4}-\d{2}-\d{2})T/.exec(name);
  return match ? match[1] : name;
}

export function restoreConfirmMatches(name: string, typed: string): boolean {
  return typed.trim() === restoreConfirmPhrase(name);
}
