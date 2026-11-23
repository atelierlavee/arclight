// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

/**
 * Dragging media onto a collection (§13).
 *
 * The HTML drag-and-drop API rather than a pointer-event library: the drag
 * here is always within one document, the payload is a list of ids, and the
 * browser already handles the drag image, the cursor and the escape key.
 *
 * A custom MIME type rather than "text/plain" so a drag from the grid cannot
 * be dropped into a text field as a stray number, and a drop target can tell
 * "our media" from any other draggable it might receive.
 */

export const MEDIA_DRAG_TYPE = "application/x-media-server-items";

export type MediaDragPayload = {
  ids: number[];
  /** For the "Added 3 items" message; the drop target has no other source. */
  label: string;
};

export function setMediaDragData(
  transfer: DataTransfer,
  payload: MediaDragPayload,
): void {
  transfer.effectAllowed = "copy";
  transfer.setData(MEDIA_DRAG_TYPE, JSON.stringify(payload));
  // A plain-text fallback so dropping outside the app degrades to something
  // meaningful rather than nothing.
  transfer.setData("text/plain", payload.label);
}

export function readMediaDragData(
  transfer: DataTransfer,
): MediaDragPayload | null {
  try {
    const raw = transfer.getData(MEDIA_DRAG_TYPE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MediaDragPayload;
    if (!Array.isArray(parsed?.ids) || parsed.ids.length === 0) return null;
    // Filtered rather than trusted: this crosses a serialisation boundary,
    // and an id that is not a number would become "NaN" in a request path.
    const ids = parsed.ids.filter(
      (id): id is number => typeof id === "number" && Number.isFinite(id),
    );
    if (ids.length === 0) return null;
    return { ids, label: typeof parsed.label === "string" ? parsed.label : "" };
  } catch {
    return null;
  }
}

/**
 * Whether a dragged thing is ours.
 *
 * Checked on dragover, where the payload cannot be read — the API only
 * exposes the *types* during a drag, to stop a page snooping on what is
 * being dragged over it. The type list is all a target gets to decide
 * whether to accept the drop.
 */
export function isMediaDrag(transfer: DataTransfer | null): boolean {
  return Boolean(transfer?.types.includes(MEDIA_DRAG_TYPE));
}
