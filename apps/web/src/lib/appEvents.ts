/**
 * The window events surfaces use to talk to each other.
 *
 * These exist because the shell owns the player and the command palette, but
 * the things that trigger them — a card in a virtualized grid, a row on the
 * home page, a context menu item — are arbitrarily deep and often unmounted
 * moments later. Threading a callback down every one of those trees, or
 * hoisting the player into a context every grid then depends on, is a lot of
 * plumbing for "play this id".
 *
 * Names were already in use as string literals in three files; collecting
 * them here is so a rename is one edit rather than a grep.
 */

export const OPEN_SEARCH_EVENT = "media-server:open-search";
export const PLAY_ITEM_EVENT = "media-server:play-item";
export const TOGGLE_FOCUS_EVENT = "media-server:toggle-focus";
export const DISCREET_OFF_EVENT = "media-server:discreet-off";

export type PlayItemDetail = {
  id: number;
  resume?: boolean;
  /**
   * Open the full detail view rather than the corner mini player.
   *
   * The shell's handler opens the mini player for everything, which is right
   * for "play this" and wrong for "show me this" — a request for an item's
   * details should not answer with a thumbnail-sized video in the corner.
   */
  details?: boolean;
};

export function openSearch(): void {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

export function playItem(id: number, options: { resume?: boolean } = {}): void {
  window.dispatchEvent(
    new CustomEvent<PlayItemDetail>(PLAY_ITEM_EVENT, {
      detail: { id, resume: options.resume ?? false },
    }),
  );
}

/** Opens an item's full detail view. */
export function openDetails(id: number): void {
  window.dispatchEvent(
    new CustomEvent<PlayItemDetail>(PLAY_ITEM_EVENT, {
      detail: { id, details: true },
    }),
  );
}

/**
 * Asks to turn discreet mode off, through the same check the shortcut uses.
 *
 * For anything else that offers the switch — the command palette — so there
 * is one guarded way out of the mode rather than a second, unguarded one.
 * DiscreetUnlockDialog answers it; a no-op when the mode is already off.
 */
export function requestDiscreetOff(): void {
  window.dispatchEvent(new Event(DISCREET_OFF_EVENT));
}

export function toggleFocusMode(): void {
  window.dispatchEvent(new Event(TOGGLE_FOCUS_EVENT));
}

/**
 * Whether a keystroke landed in something the user is typing into.
 *
 * §24 requires single-key shortcuts not to fire while typing, and every
 * surface that adds one needs the same test — the grid, the modal and the
 * palette each had their own before this.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches(
    "input, textarea, select, [contenteditable], [contenteditable=true]",
  );
}
