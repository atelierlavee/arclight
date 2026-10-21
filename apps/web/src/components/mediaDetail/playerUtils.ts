// Only offer "Continue Watching" for meaningful progress: not basically the
// start (nothing to resume) or basically the end (same as starting over).
export const MIN_RESUMABLE_SECONDS = 15;

// Throttle for position saves — `timeupdate` fires several times a second.
export const SAVE_INTERVAL_MS = 8000;

/** The bare 0–9 row keys. Numpad digits report the same `key`, so they count too. */
export function isDigitKey(key: string): boolean {
  return key.length === 1 && key >= "0" && key <= "9";
}

/**
 * Whether a keystroke belongs to something the user is typing into.
 *
 * The header search box sits on the page behind the modal, and the title,
 * description, tag, performer and studio editors all render inside it — so
 * without this, typing a space into any of them would pause the video
 * instead of typing a space.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches(
    "input, textarea, select, [contenteditable], [contenteditable=true]",
  );
}
