// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

/** The id a settings section is reachable by, so settings search can jump to it. */
export function settingsAnchor(title: string): string {
  return `settings-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}
