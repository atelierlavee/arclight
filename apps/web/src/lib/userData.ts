import { clearAllProfileData } from "./profileStorage";

/**
 * Forgets what this browser remembers about the people signing out.
 *
 * The history-like stores go, for every profile on this browser: recently
 * viewed and played, pins, saved and recent searches, the queue, per-view
 * scroll positions, dismissed notifications and the daily-pick seed. Signing
 * out on a shared machine should not leave the next person a list of what
 * anyone watched. The inventory of per-person keys lives in profileStorage.ts.
 *
 * Device preferences stay — appearance, player volume and speed, the
 * sidebar, sort order, the network layout. They describe the screen rather
 * than the person.
 */
export function clearUserLocalData(): void {
  clearAllProfileData();
}
