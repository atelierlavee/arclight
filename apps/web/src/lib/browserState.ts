// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { isStorageHousekeeping, pkey, storageProfile, PROFILE_LOCAL_KEYS } from "./profileStorage";

/**
 * Keeps a server copy of what the browser remembers that no rescan could
 * bring back — pins, saved and recent searches, recently played and browsed,
 * dismissed hints and notifications, when the feed was last read, and the
 * handful of view choices (sorts, sidebar, player volume and speed). The
 * server stores it per profile, so it is in every backup, and a new browser
 * or a restored server gets it back.
 *
 * localStorage stays the working copy: every store keeps reading and writing
 * it as before. A change to one of these keys is sent on shortly after
 * (debounced, per key); on opening a profile, keys this browser lacks are
 * filled from the server before the app renders, and keys the server lacks
 * are sent up — which is also how data from before this existed gets
 * backed up the first time.
 *
 * The server names each key without the profile prefix: `pinned-items`, not
 * `p3:pinned-items`.
 */

/** Per-person keys, stored under the profile prefix. */
const PERSONAL = new Set<string>([...PROFILE_LOCAL_KEYS, "slideshow-seconds"]);
/** Choices kept under bare keys: they describe the screen, but are still yours. */
const CHOICES = new Set<string>([
  "sort-preference",
  "performers-sort",
  "performer-video-wall",
  "sidebar-collapsed",
  "sidebar-library-open",
  "player-volume",
  "player-rate",
  "player-skip-seconds",
]);
const CHOICE_PREFIXES = ["performer-network-pins:"];

const isChoice = (name: string) => CHOICES.has(name) || CHOICE_PREFIXES.some((p) => name.startsWith(p));

/** The server's name for a localStorage key, or null if it is not one kept. */
export function syncedName(storageKey: string, profileId: number | null): string | null {
  if (profileId !== null) {
    const prefix = `p${profileId}:`;
    if (storageKey.startsWith(prefix)) {
      const name = storageKey.slice(prefix.length);
      return PERSONAL.has(name) ? name : null;
    }
    if (/^p\d+:/.test(storageKey)) return null; // another profile's
    return isChoice(storageKey) ? storageKey : null;
  }
  return PERSONAL.has(storageKey) || isChoice(storageKey) ? storageKey : null;
}

/** Where the server's `name` lives in this browser, for the current profile. */
export function storageKeyFor(name: string): string | null {
  if (PERSONAL.has(name)) return pkey(name);
  return isChoice(name) ? name : null;
}

const DEBOUNCE_MS = 600;
const pending = new Map<string, { storageKey: string; timer: ReturnType<typeof setTimeout> }>();
/** Set while restoring from the server, so restored values are not echoed back. */
let restoring = false;

function send(name: string, value: string | null, keepalive = false): void {
  void fetch("/api/browser-state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: name, value }),
    keepalive,
  }).catch(() => {
    // Offline: the next restore sends up whatever the server is missing.
  });
}

function schedule(storageKey: string): void {
  const name = syncedName(storageKey, storageProfile());
  if (!name) return;
  const existing = pending.get(name);
  if (existing) clearTimeout(existing.timer);
  if (restoring) return;
  if (isStorageHousekeeping()) {
    pending.delete(name);
    return;
  }
  const timer = setTimeout(() => flush(name), DEBOUNCE_MS);
  pending.set(name, { storageKey, timer });
}

function flush(name: string, keepalive = false): void {
  const entry = pending.get(name);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(name);
  let value: string | null = null;
  try {
    value = localStorage.getItem(entry.storageKey);
  } catch {
    return;
  }
  send(name, value, keepalive);
}

/**
 * Watches localStorage writes, once, for the whole app. Patched on the
 * prototype (assigning to `localStorage.setItem` would store an item named
 * "setItem") and only for localStorage, not sessionStorage.
 */
export function installBrowserStateSync(): void {
  const proto = Storage.prototype;
  const { setItem, removeItem } = proto;
  proto.setItem = function (this: Storage, key: string, value: string) {
    setItem.call(this, key, value);
    if (this === window.localStorage) schedule(key);
  };
  proto.removeItem = function (this: Storage, key: string) {
    removeItem.call(this, key);
    if (this === window.localStorage) schedule(key);
  };
  // Leaving the page mid-debounce still sends the change.
  window.addEventListener("pagehide", () => {
    for (const name of [...pending.keys()]) flush(name, true);
  });
}

/**
 * Brings this browser and the server's copy together for the current
 * profile. A key this browser lacks is filled from the server; a key the
 * server lacks is sent up; where both have one, the server's wins, so every
 * browser converges on the same pins and searches. Never throws: with the
 * server unreachable, the app simply opens on what the browser has.
 */
export async function restoreBrowserState(): Promise<true> {
  try {
    const res = await fetch("/api/browser-state", { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return true;
    const { entries } = (await res.json()) as { entries?: Record<string, string> };
    const server = entries ?? {};
    restoring = true;
    try {
      for (const [name, value] of Object.entries(server)) {
        const key = storageKeyFor(name);
        if (key && localStorage.getItem(key) !== value) localStorage.setItem(key, value);
      }
    } finally {
      restoring = false;
    }
    for (const key of Object.keys(localStorage)) {
      const name = syncedName(key, storageProfile());
      const value = localStorage.getItem(key);
      if (name && !(name in server) && value !== null) send(name, value);
    }
  } catch {
    // Unreachable, slow or storage blocked: open on what the browser has.
  }
  return true;
}
