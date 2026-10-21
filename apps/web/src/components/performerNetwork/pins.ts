/**
 * Where you've dragged people, per view, kept in this browser only — a
 * display preference, not library data. Wrapped in try/catch because
 * private windows can refuse storage outright.
 */
export type Pins = Record<string, [number, number]>;
const pinsKey = (layout: string) => `performer-network-pins:${layout}`;
export function readPins(layout: string): Pins {
  try {
    const parsed = JSON.parse(localStorage.getItem(pinsKey(layout)) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Pins) : {};
  } catch {
    return {};
  }
}
export function writePins(layout: string, pins: Pins) {
  try {
    if (Object.keys(pins).length === 0) localStorage.removeItem(pinsKey(layout));
    else localStorage.setItem(pinsKey(layout), JSON.stringify(pins));
  } catch {
    // Forgetting a layout is harmless.
  }
}
