/**
 * Browser storage split by profile.
 *
 * What a browser remembers about the *person* — recently viewed, pins, saved
 * and recent searches, the queue, scroll positions, dismissed notifications,
 * the daily pick — is kept under `p{id}:{key}`, so two people sharing a
 * machine never see each other's trail. Device preferences (sidebar, volume,
 * playback rate, sort order, the network layout, the cached appearance) stay
 * under their bare keys: they describe the screen, not the person.
 *
 * The current profile is a module value rather than React state because the
 * stores reading it are plain functions called from anywhere. ProfileProvider
 * sets it during render, before any child reads storage, and the app subtree
 * is keyed on the profile id so every store re-reads after a switch.
 *
 * With no profile (a server without profiles, or single-user tests) keys stay
 * bare — exactly the old behaviour.
 */

/** Per-person keys in localStorage. */
export const PROFILE_LOCAL_KEYS = [
  "recent-browsed",
  "recent-played",
  "recent-edited",
  "recent-favourited",
  "pinned-items",
  "recent-searches",
  "saved-searches",
  "dismissed-notifications",
] as const;

/** Per-person keys in sessionStorage. */
export const PROFILE_SESSION_KEYS = [
  "playback-queue",
  "dailyPickSeed",
  "media-server:app-open-unlocked",
] as const;

/** Per-person sessionStorage key prefixes (one key per view). */
export const PROFILE_SESSION_PREFIXES = ["browse-scroll:"] as const;

const MIGRATED_KEY = "profiles-storage-migrated";
const NAMESPACED = /^p\d+:/;

let currentProfileId: number | null = null;

export function setStorageProfile(id: number | null): void {
  currentProfileId = id;
}

export function storageProfile(): number | null {
  return currentProfileId;
}

/** The storage key for `key` under the current profile. */
export function pkey(key: string): string {
  return currentProfileId === null ? key : `p${currentProfileId}:${key}`;
}

function isPersonal(key: string, area: "local" | "session"): boolean {
  if (area === "local") return (PROFILE_LOCAL_KEYS as readonly string[]).includes(key);
  return (
    (PROFILE_SESSION_KEYS as readonly string[]).includes(key) ||
    PROFILE_SESSION_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

function sweep(storage: Storage, match: (key: string) => boolean) {
  for (const key of Object.keys(storage)) {
    if (match(key)) storage.removeItem(key);
  }
}

/**
 * Moves the pre-profiles bare keys to the owner profile, once per browser.
 *
 * Whatever was stored before profiles existed belonged to the one person who
 * used the app — who is now the owner. Runs only when the owner is selected;
 * a target key that already exists wins over the old bare one.
 */
export function migrateBareKeysToOwner(ownerId: number): void {
  try {
    if (localStorage.getItem(MIGRATED_KEY) === "1") return;
    const move = (storage: Storage, area: "local" | "session") => {
      for (const key of Object.keys(storage)) {
        if (NAMESPACED.test(key) || !isPersonal(key, area)) continue;
        const target = `p${ownerId}:${key}`;
        const value = storage.getItem(key);
        if (value !== null && storage.getItem(target) === null) storage.setItem(target, value);
        storage.removeItem(key);
      }
    };
    move(localStorage, "local");
    move(sessionStorage, "session");
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    // Storage blocked: nothing stored to move.
  }
}

/**
 * Session-scoped traces of one profile: the queue, scroll positions, the
 * daily-pick seed and the app-open unlock. Called when that profile is left.
 */
export function clearProfileSession(id: number | null): void {
  const prefix = id === null ? "" : `p${id}:`;
  try {
    sweep(sessionStorage, (key) => {
      if (id === null) return !NAMESPACED.test(key) && isPersonal(key, "session");
      return key.startsWith(prefix) && isPersonal(key.slice(prefix.length), "session");
    });
  } catch {
    // Storage blocked: nothing stored to clear.
  }
}

/** Every profile's per-person keys, and the bare ones — for signing out. */
export function clearAllProfileData(): void {
  const personal = (key: string, area: "local" | "session") =>
    isPersonal(key.replace(NAMESPACED, ""), area);
  try {
    sweep(localStorage, (key) => personal(key, "local"));
  } catch {
    // As above.
  }
  try {
    sweep(sessionStorage, (key) => personal(key, "session"));
  } catch {
    // As above.
  }
}
