import { Expand, LayoutGrid, Maximize2, Shrink } from "lucide-react";

/** The buttons in the graph's corner: fit, full screen, and un-place everyone. */
export function GraphControls({
  onFit,
  fullscreen,
  onToggleFullscreen,
  pinCount,
  onResetLayout,
}: {
  onFit: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  pinCount: number;
  onResetLayout: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onFit}
        title="Fit everyone in view"
        className="absolute right-3 top-3 grid size-8 place-items-center rounded-md bg-popover/90 text-muted-foreground ring-1 ring-border hover:text-foreground"
      >
        <Maximize2 className="size-4" />
      </button>
      <button
        type="button"
        onClick={onToggleFullscreen}
        title={fullscreen ? "Leave full screen" : "Full screen"}
        className="absolute right-3 top-12 grid size-8 place-items-center rounded-md bg-popover/90 text-muted-foreground ring-1 ring-border hover:text-foreground"
      >
        {fullscreen ? <Shrink className="size-4" /> : <Expand className="size-4" />}
      </button>
      {pinCount > 0 && (
        <button
          type="button"
          onClick={onResetLayout}
          title={`Let the ${pinCount} you've placed float again`}
          className="absolute right-3 top-[5.25rem] grid size-8 place-items-center rounded-md bg-popover/90 text-muted-foreground ring-1 ring-border hover:text-foreground"
        >
          <LayoutGrid className="size-4" />
        </button>
      )}
    </>
  );
}
