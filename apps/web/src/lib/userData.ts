import { clearPins } from "./pinned";
import { QUEUE_STORAGE_KEY } from "./queueUtils";
import { clearAllRecent } from "./recent";
import { clearRecentSearches } from "./recentSearches";
import { clearSavedSearches } from "./savedSearches";

/**
 * Forgets what this browser remembers about the person signing out.
 *
 * The history-like stores go: recently viewed and played, pins, saved and
 * recent searches, the queue, per-view scroll positions and dismissed
 * notifications. Signing out on a shared machine should not leave the next
 * person a list of what the last one watched.
 *
 * Device preferences stay — appearance, player volume and speed, the
 * sidebar, sort order, the network layout. They describe the screen rather
 * than the person, and appearance is stored per install on the server
 * anyway, so clearing the local copy would only cost a flash of defaults on
 * the next load.
 */
export function clearUserLocalData(): void {
  clearAllRecent();
  clearPins();
  clearRecentSearches();
  clearSavedSearches();
  try {
    localStorage.removeItem("dismissed-notifications");
  } catch {
    // Storage blocked: there is nothing stored to clear.
  }
  try {
    sessionStorage.removeItem(QUEUE_STORAGE_KEY);
    sessionStorage.removeItem("dailyPickSeed");
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith("browse-scroll:")) sessionStorage.removeItem(key);
    }
  } catch {
    // As above.
  }
}
