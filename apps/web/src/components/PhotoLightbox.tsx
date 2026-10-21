import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Pause,
  Play,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  clampPan,
  isPannable,
  MAX_SCALE,
  MIN_SCALE,
  ZOOM_RESET,
  zoomAt,
  type ZoomState,
} from "@/lib/zoom";
import { Portal } from "./Portal";
import { useFocusTrap } from "@/lib/useFocusTrap";

export type LightboxPhoto = { id: number; title: string };

/** How long each photo holds during a slideshow. */
const SLIDESHOW_MS = 4000;

/**
 * Full-screen photo viewer, shared by the in-video gallery strip and the
 * album page.
 *
 * Extracted rather than copied: the keyboard handling below is subtle enough
 * that two versions would drift, and the album page needs exactly the same
 * behaviour.
 *
 * Zoom, pan, the thumbnail strip, fullscreen and the slideshow are all §12.
 * The zoom maths lives in `lib/zoom` because it is the one part with a right
 * answer that can be checked without a browser; everything here is layout
 * and event plumbing.
 */
export function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
  onReachEnd,
}: {
  photos: LightboxPhoto[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
  /**
   * Called when stepping near the end of what's loaded, so the caller can
   * fetch more. Without it an album of 121 photos dead-ends at whatever the
   * first page happened to contain.
   */
  onReachEnd?: () => void;
}) {
  const [zoom, setZoom] = useState<ZoomState>(ZOOM_RESET);
  const [slideshow, setSlideshow] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showStrip, setShowStrip] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef);
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(
    null,
  );

  const step = useCallback(
    (delta: number) => onIndexChange((index + delta + photos.length) % photos.length),
    [index, photos.length, onIndexChange],
  );

  /** The frame the image is fitted into, for the pan bounds. */
  function frameSize() {
    const rect = containerRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  }

  // Changing photo resets the zoom. Carrying a 4× magnification of one
  // corner onto the next picture shows a different corner of a different
  // image, which reads as the viewer having lost the photo.
  useEffect(() => setZoom(ZOOM_RESET), [index]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Stops the detail modal's own Escape handler closing everything at
        // once — one press should close one layer. Zoom counts as a layer:
        // Escape backs out of a magnified view before it closes the viewer.
        event.stopPropagation();
        if (zoom.scale > MIN_SCALE) setZoom(ZOOM_RESET);
        else onClose();
        return;
      }
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "+" || event.key === "=")
        setZoom((current) =>
          zoomAt(current, current.scale * 1.5, { x: 0, y: 0 }, frameSize()),
        );
      if (event.key === "-")
        setZoom((current) =>
          zoomAt(current, current.scale / 1.5, { x: 0, y: 0 }, frameSize()),
        );
      if (event.key === "0") setZoom(ZOOM_RESET);
      if (event.key === " ") {
        event.preventDefault();
        setSlideshow((value) => !value);
      }
      if (event.key === "f") void toggleFullscreen();
      if (event.key === "t") setShowStrip((value) => !value);
    }

    // Capture phase, so this runs before any window-level listener behind it.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
    // `toggleFullscreen` and `frameSize` read refs and never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, onClose, zoom.scale]);

  // Ask for more while there is still a little runway, so stepping forward
  // doesn't stall at the boundary.
  useEffect(() => {
    if (onReachEnd && index >= photos.length - 3) onReachEnd();
  }, [index, photos.length, onReachEnd]);

  // The slideshow advances on a timer that restarts with the index, so a
  // manual step mid-show gives you a full interval on the photo you chose
  // rather than whatever was left of the previous one.
  useEffect(() => {
    if (!slideshow || photos.length < 2) return;
    const timer = setTimeout(() => step(1), SLIDESHOW_MS);
    return () => clearTimeout(timer);
  }, [slideshow, index, photos.length, step]);

  // Zooming in stops the slideshow. Advancing away from a detail you just
  // magnified is the viewer overriding a deliberate action with a timer.
  useEffect(() => {
    if (zoom.scale > MIN_SCALE) setSlideshow(false);
  }, [zoom.scale]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await containerRef.current?.requestFullscreen();
    } catch {
      // Blocked by the browser. The viewer still works at window size.
    }
  }

  function handleWheel(event: React.WheelEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Measured from the centre of the frame, which is the origin the
    // transform is applied about.
    const origin = {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2,
    };
    setZoom((current) =>
      zoomAt(
        current,
        // Exponential so each notch feels the same at every magnification —
        // a fixed step is imperceptible at 8× and violent at 1×.
        current.scale * Math.pow(1.0015, -event.deltaY),
        origin,
        { width: rect.width, height: rect.height },
      ),
    );
  }

  function handlePointerDown(event: React.PointerEvent) {
    if (!isPannable(zoom)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      panX: zoom.x,
      panY: zoom.y,
    };
  }

  function handlePointerMove(event: React.PointerEvent) {
    const start = dragStart.current;
    if (!start) return;
    setZoom((current) =>
      clampPan(
        {
          scale: current.scale,
          x: start.panX + (event.clientX - start.x),
          y: start.panY + (event.clientY - start.y),
        },
        frameSize(),
      ),
    );
  }

  function endDrag(event: React.PointerEvent) {
    if (!dragStart.current) return;
    dragStart.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  const photo = photos[index];
  if (!photo) return null;

  // The neighbours, fetched by the browser but never shown. Stepping through
  // a gallery is the one time you know exactly what comes next, so waiting
  // for it to download is avoidable.
  const neighbours = [photos[index + 1], photos[index - 1]].filter(Boolean);

  const zoomed = zoom.scale > MIN_SCALE;
  const buttonClass =
    "flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 disabled:opacity-40";

  return (
    <Portal>
      <div
        ref={containerRef}
        className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-black/90 p-4"
        onClick={() => {
          // A click on the backdrop closes, but not while zoomed — there the
          // backdrop is where you have just been dragging, and closing the
          // viewer on pointer-up would be a trap.
          if (!zoomed) onClose();
        }}
        onWheel={handleWheel}
        role="dialog"
        aria-modal="true"
        aria-label="Photo"
      >
        {/* The full file, not the thumbnail. */}
        <img
          src={`/api/stream/${photo.id}`}
          alt={photo.title}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            // Double-click toggles between fit and a useful magnification,
            // which is the gesture every image viewer shares.
            setZoom((current) =>
              current.scale > MIN_SCALE
                ? ZOOM_RESET
                : zoomAt(current, 2.5, { x: 0, y: 0 }, frameSize()),
            );
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
            // Only while actually zoomed: a transition on every pan frame
            // makes dragging lag behind the pointer.
            transition: dragStart.current ? "none" : "transform 150ms ease-out",
            cursor: zoomed ? "grab" : "default",
          }}
          className="max-h-full max-w-full rounded object-contain"
        />

        {neighbours.map((neighbour) => (
          <link
            key={neighbour.id}
            rel="preload"
            as="image"
            href={`/api/stream/${neighbour.id}`}
          />
        ))}

        <div
          className="absolute right-4 top-4 flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() =>
              setZoom((current) =>
                zoomAt(current, current.scale / 1.5, { x: 0, y: 0 }, frameSize()),
              )
            }
            disabled={zoom.scale <= MIN_SCALE}
            aria-label="Zoom out"
            title="Zoom out (−)"
            className={buttonClass}
          >
            <ZoomOut className="size-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              setZoom((current) =>
                zoomAt(current, current.scale * 1.5, { x: 0, y: 0 }, frameSize()),
              )
            }
            disabled={zoom.scale >= MAX_SCALE}
            aria-label="Zoom in"
            title="Zoom in (+)"
            className={buttonClass}
          >
            <ZoomIn className="size-4" />
          </button>
          {photos.length > 1 && (
            <button
              type="button"
              onClick={() => setSlideshow((value) => !value)}
              aria-pressed={slideshow}
              aria-label={slideshow ? "Pause slideshow" : "Start slideshow"}
              title={slideshow ? "Pause slideshow (space)" : "Slideshow (space)"}
              className={buttonClass}
            >
              {slideshow ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            title="Fullscreen (f)"
            className={buttonClass}
          >
            {fullscreen ? (
              <Minimize className="size-4" />
            ) : (
              <Maximize className="size-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close photo"
            className={buttonClass}
          >
            <X className="size-5" />
          </button>
        </div>

        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                step(-1);
              }}
              aria-label="Previous photo"
              className="absolute left-4 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                step(1);
              }}
              aria-label="Next photo"
              className="absolute right-4 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
            >
              <ChevronRight className="size-6" />
            </button>

            <div
              className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 pb-4"
              onClick={(e) => e.stopPropagation()}
            >
              {showStrip && (
                <div className="flex max-w-[min(100%,60rem)] gap-1.5 overflow-x-auto rounded-lg bg-black/70 p-2 backdrop-blur-sm">
                  {photos.map((entry, entryIndex) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => onIndexChange(entryIndex)}
                      aria-label={`Show photo ${entryIndex + 1}`}
                      aria-current={entryIndex === index ? "true" : undefined}
                      className={cn(
                        "size-14 shrink-0 overflow-hidden rounded transition-opacity",
                        entryIndex === index
                          ? "ring-2 ring-white"
                          : "opacity-60 hover:opacity-100",
                      )}
                    >
                      <img
                        src={`/api/media-items/${entry.id}/thumbnail`}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowStrip((value) => !value)}
                aria-expanded={showStrip}
                className="rounded-full bg-black/70 px-3 py-1 text-xs text-white backdrop-blur-sm transition-colors hover:bg-black/90"
              >
                {index + 1} / {photos.length}
              </button>
            </div>
          </>
        )}
      </div>
    </Portal>
  );
}
