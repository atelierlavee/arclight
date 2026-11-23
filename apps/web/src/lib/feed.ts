// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

/** "Alice", "Alice and Bea", "Alice, Bea and 2 others". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const others = names.length - 2;
  return `${names[0]}, ${names[1]} and ${others} other${others === 1 ? "" : "s"}`;
}

/**
 * Whether an item arrived since the viewer last opened the feed. Nothing is
 * marked on a first visit: with no last visit, everything would be "new",
 * which says nothing.
 */
export function arrivedSince(createdAt: string, lastSeen: number | null): boolean {
  return lastSeen !== null && new Date(createdAt).getTime() > lastSeen;
}
