import { useEffect, useState } from "react";
import { useAppearance } from "@/lib/appearance";

/** Counts up from zero to `value`, unless animation is turned down. */
export function useCountUp(value: number) {
  const { motion } = useAppearance();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (motion !== "full") return;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 1200);
      setShown(value * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, motion]);
  return motion === "full" ? shown : value;
}
