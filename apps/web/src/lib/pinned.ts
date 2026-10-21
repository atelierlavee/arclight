import { pkey } from "./profileStorage";
export type Pin =
  | { id: string; type: "performer"; label: string; performerId: number }
  | { id: string; type: "studio"; label: string; studioId: number }
  | { id: string; type: "collection"; label: string; collectionId: number }
  | { id: string; type: "folder"; label: string; folderId: number };

const STORAGE_KEY = "pinned-items";
const CHANGE_EVENT = "media-server:pins-changed";

export function readPins(): Pin[] {
  try {
    const value = JSON.parse(
      localStorage.getItem(pkey(STORAGE_KEY)) ?? "[]",
    ) as unknown;
    return Array.isArray(value) ? (value as Pin[]) : [];
  } catch {
    return [];
  }
}

function writePins(pins: Pin[]): void {
  try {
    localStorage.setItem(pkey(STORAGE_KEY), JSON.stringify(pins));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Pins are optional when browser storage is unavailable.
  }
}

export function isPinned(id: string): boolean {
  return readPins().some((pin) => pin.id === id);
}

export function togglePin(pin: Pin): void {
  const pins = readPins();
  writePins(
    pins.some((entry) => entry.id === pin.id)
      ? pins.filter((entry) => entry.id !== pin.id)
      : [...pins, pin],
  );
}

export function removePin(id: string): void {
  writePins(readPins().filter((pin) => pin.id !== id));
}

/** Drops the pin for a folder that has gone away (hidden, or vaulted). */
export function removeFolderPins(folderId: number): void {
  const pins = readPins();
  const kept = pins.filter(
    (pin) => !(pin.type === "folder" && pin.folderId === folderId),
  );
  if (kept.length !== pins.length) writePins(kept);
}

/** All pins, for signing out. */
export function clearPins(): void {
  try {
    localStorage.removeItem(pkey(STORAGE_KEY));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // As above.
  }
}

export function pinsChangedEvent(): string {
  return CHANGE_EVENT;
}
