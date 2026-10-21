import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Pencil, Play, RotateCcw, X } from "lucide-react";
import { fetchItem, framingStyle, thumbnailUrl } from "@/lib/mediaItemApi";
import { useAppearance } from "@/lib/appearance";
import { formatDuration } from "@/lib/utils";
import { DescriptionEditor } from "./DescriptionEditor";
import { EditableTitle } from "./EditableTitle";
import { Portal } from "./Portal";
import { TagEditor } from "./TagEditor";
import { qk } from "@/lib/queryKeys";
import { useIsOwner } from "@/lib/profile";

/** Below this, "resume" would put you back where starting over does anyway. */
const MIN_RESUMABLE_SECONDS = 15;

/**
 * Inspect an item without leaving the page (§4).
 *
 * A side panel rather than a second modal, because the point of a peek is
 * that the grid stays where it is — you glance at one item, decide, and
 * carry on down the same scroll position with the same filters. A modal
 * covers exactly the thing you are comparing against.
 *
 * It holds the page still underneath. Scrolling a grid you cannot see behind
 * a panel you are reading only loses your place in it, and the panel has its
 * own scroll for content that overflows — so the wheel always has something
 * sensible to act on.
 *
 * Locking the scroll does not make this a modal. Clicks still reach the page:
 * a tile behind is clickable, and clicking one closes the peek and opens that
 * tile. That is the part that separates a peek from the detail modal, and it
 * is preserved precisely because there is no backdrop swallowing the click.
 *
 * Reading and editing are separate modes, and reading is the default. A peek
 * is what you open to *look* at something, usually while deciding what to
 * play. Fields that are live inputs the moment the panel appears invite edits
 * nobody meant to make, and make the panel read as a form rather than as an
 * answer. Edit is one click away and changes the same fields in place, so
 * this is still the Quick Edit §4 asks for — it just stops assuming you came
 * here to type.
 */
export function PeekPanel({
  itemId,
  onClose,
  onPlay,
}: {
  itemId: number;
  onClose: () => void;
  onPlay: (id: number, options: { resume: boolean }) => void;
}) {
  const { discreet, discreetBlurPercent } = useAppearance();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [editingRequested, setEditing] = useState(false);
  const isOwner = useIsOwner();
  const editing = editingRequested && isOwner;

  const { data: item, isLoading } = useQuery({
    queryKey: qk.mediaItem.detail(itemId),
    queryFn: () => fetchItem(itemId),
  });

  // A different item is a different question. Arriving already in edit mode
  // because the last one was left that way is how a stray keystroke lands in
  // the wrong record.
  useEffect(() => setEditing(false), [itemId]);

  // Focus moves into the panel on open so a keyboard user is actually in it,
  // and the close button is the safe landing spot — it is the way out, and
  // reading order continues from there into the content.
  useEffect(() => {
    closeRef.current?.focus();
  }, [itemId]);

  /**
   * Escape closes, unless something is open on top of it.
   *
   * This used to require focus to be inside the panel, which was too strict
   * in a way that produced the obvious bug: clicking anywhere outside moved
   * focus to <body>, and from then on Escape did nothing at all. The panel
   * is non-modal by design — the page behind it stays usable — so focus
   * leaving it is ordinary rather than a signal that it should stop
   * listening.
   *
   * The guard it replaces asked "does the peek own the focus"; what it meant
   * to ask was "is the peek the topmost thing", and only a modal dialog or a
   * menu can be above it.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (
        document.querySelector(
          '[role="dialog"][aria-modal="true"], [role="menu"]',
        )
      )
        return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  /**
   * Clicking away closes it (§4).
   *
   * On mousedown rather than click, matching the appearance and filter
   * panels, so the dismissal happens as you press rather than lagging until
   * you release somewhere else.
   *
   * There is deliberately no backdrop. A backdrop would swallow the click,
   * and the point of a peek is that the grid behind it stays live — clicking
   * a different tile should reach that tile, not merely dismiss this.
   *
   * Other floating things are exempt: a toast carrying an Undo, a menu, a
   * dialog. Those sit above the page too, and clicking one is not "clicking
   * away".
   */
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (
        target.closest(
          '[role="dialog"], [role="menu"], [role="status"], [role="alert"]',
        )
      )
        return;
      onClose();
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [onClose]);

  const progressPercent =
    item?.durationSeconds && item.lastPositionSeconds
      ? Math.min(
          100,
          Math.round((item.lastPositionSeconds / item.durationSeconds) * 100),
        )
      : null;
  const canResume =
    item?.itemType === "video" &&
    item.lastPositionSeconds > MIN_RESUMABLE_SECONDS &&
    (progressPercent ?? 0) < 97;

  return (
    <Portal>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label={item ? `Details for ${item.title}` : "Details"}
        className="animate-slide-in-right fixed right-0 top-0 z-40 flex h-screen w-[26rem] max-w-[calc(100vw-2rem)] flex-col border-l border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {editing ? "Editing" : "Peek"}
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close peek panel"
            title="Close (Esc)"
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {isLoading || !item ? (
          <div className="space-y-3 p-4">
            <div className="skeleton aspect-video w-full rounded-md" />
            <div className="skeleton h-5 w-2/3 rounded" />
            <div className="skeleton h-4 w-1/2 rounded" />
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="relative overflow-hidden rounded-md bg-secondary">
              <img
                src={thumbnailUrl(item)}
                alt=""
                style={{
                  ...framingStyle(item),
                  // The same privacy rule as every other surface: the panel
                  // is not an exception to Discreet Mode just because it is
                  // small (§29).
                  ...(discreet
                    ? { filter: `blur(${discreetBlurPercent / 4}px)` }
                    : undefined),
                }}
                className="aspect-video w-full object-cover"
              />
              {progressPercent !== null && (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              )}
            </div>

            {editing ? (
              <EditableTitle
                itemId={item.id}
                title={item.title}
                className="text-lg font-semibold"
              />
            ) : (
              <h2 className="sensitive text-lg font-semibold leading-snug">
                {item.title}
              </h2>
            )}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {item.studio && <span>{item.studio}</span>}
              {item.releaseDate && (
                <>
                  <span aria-hidden>·</span>
                  <span>{item.releaseDate.slice(0, 4)}</span>
                </>
              )}
              {item.durationSeconds !== null && (
                <>
                  <span aria-hidden>·</span>
                  <span>{formatDuration(item.durationSeconds)}</span>
                </>
              )}
              {progressPercent !== null && (
                <>
                  <span aria-hidden>·</span>
                  <span>{progressPercent}% watched</span>
                </>
              )}
            </div>

            {item.performers.length > 0 && (
              <p className="sensitive text-sm">
                {item.performers.map((performer) => performer.name).join(", ")}
              </p>
            )}

            {/* Play and Edit only. Favourite, watched and queue each have a
                keyboard shortcut and a context-menu entry that act on the
                tile directly, so repeating them here put a row of controls in
                front of the thing the panel was opened to show. */}
            <div className="flex flex-wrap gap-2">
              {item.itemType === "video" && (
                <>
                  <button
                    type="button"
                    onClick={() => onPlay(item.id, { resume: false })}
                    className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <Play className="size-3.5 fill-current" />
                    {canResume ? "Start over" : "Play"}
                  </button>
                  {canResume && (
                    <button
                      type="button"
                      onClick={() => onPlay(item.id, { resume: true })}
                      className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
                    >
                      <RotateCcw className="size-3.5" /> Resume
                    </button>
                  )}
                </>
              )}
              {isOwner && <button
                type="button"
                onClick={() => setEditing((value) => !value)}
                aria-pressed={editing}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
              >
                {editing ? (
                  <>
                    <Check className="size-3.5" /> Done
                  </>
                ) : (
                  <>
                    <Pencil className="size-3.5" /> Edit
                  </>
                )}
              </button>}
            </div>

            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Description
              </h3>
              {editing ? (
                <DescriptionEditor
                  itemId={item.id}
                  description={item.description}
                />
              ) : item.description ? (
                // In full, not clamped. ClampedText exists because a long
                // synopsis can push a page's other content below the fold —
                // but here the description is the last thing but one in a
                // panel that already scrolls, so there is nothing below it to
                // protect and the clamp only costs a click to read what you
                // opened the panel for.
                //
                // `whitespace-pre-wrap` keeps the paragraph breaks that come
                // with a scraped description; without it the whole thing
                // collapses into one block.
                <p className="sensitive whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground/60">
                  No description yet.
                </p>
              )}
            </section>

            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tags
              </h3>
              {item.tags.length === 0 && !editing ? (
                <p className="text-sm text-muted-foreground/60">No tags yet.</p>
              ) : (
                <TagEditor
                  itemId={item.id}
                  tags={item.tags}
                  readOnly={!editing}
                />
              )}
            </section>
          </div>
        )}
      </div>
    </Portal>
  );
}
