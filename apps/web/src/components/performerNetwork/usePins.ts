import { useRef, useState } from "react";
import { readPins, writePins, type Pins } from "./pins";

/**
 * The pins for one layout, read afresh whenever the layout changes, with
 * helpers that keep storage and the count of placed people in step.
 *
 * Read on first use after a change of layout rather than during render, so
 * render never touches the ref; every caller is an effect or a handler.
 */
export function usePins(layoutKey: string) {
  const pinsRef = useRef<{ layout: string; pins: Pins }>({ layout: "", pins: {} });
  const getPins = () => {
    if (pinsRef.current.layout !== layoutKey) {
      pinsRef.current = { layout: layoutKey, pins: readPins(layoutKey) };
    }
    return pinsRef.current.pins;
  };
  const [pinCount, setPinCount] = useState(0);

  const savePins = (pins: Pins) => {
    getPins();
    pinsRef.current.pins = pins;
    writePins(layoutKey, pins);
    setPinCount(Object.keys(pins).length);
  };
  const pin = (id: number, x: number, y: number) =>
    savePins({ ...getPins(), [id]: [x, y] as [number, number] });
  const unpin = (id: number) => {
    const { [id]: _removed, ...rest } = getPins();
    savePins(rest);
  };
  const clearPins = () => savePins({});

  return { getPins, pinCount, setPinCount, pin, unpin, clearPins };
}
