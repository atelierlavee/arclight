import { useEffect, useRef, useState } from "react";

/**
 * Whether the overlaid player controls are showing, and the timers that fade
 * them out again once real playback is running.
 */
export function usePlayerControlsVisibility(mode: "preview" | "playing") {
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPlayerControls, setShowPlayerControls] = useState(true);

  function revealPlayerControls() {
    setShowPlayerControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (mode === "playing") {
      controlsTimer.current = setTimeout(
        () => setShowPlayerControls(false),
        2200,
      );
    }
  }

  function scheduleHideControls() {
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(
      () => setShowPlayerControls(false),
      1200,
    );
  }

  useEffect(() => {
    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    };
  }, []);

  useEffect(() => {
    if (mode === "playing") revealPlayerControls();
    else setShowPlayerControls(true);
    // revealPlayerControls is rebuilt every render; only a mode change should run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return { showPlayerControls, revealPlayerControls, scheduleHideControls };
}
