import { GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MiniPointerHandlers } from "./useMiniPlayerFrame";

/** The mini player's drag strip along the top and resize corner at the bottom right. */
export function MiniPlayerHandles({
  showDragHandle,
  visible,
  dragHandlers,
  resizeHandlers,
}: {
  showDragHandle: boolean;
  visible: boolean;
  dragHandlers: MiniPointerHandlers;
  resizeHandlers: MiniPointerHandlers;
}) {
  return (
    <>
      {showDragHandle && (
        <div
          role="slider"
          tabIndex={0}
          aria-label="Move mini-player"
          title="Drag to move mini-player"
          {...dragHandlers}
          className={cn(
            "absolute inset-x-0 top-0 z-20 flex h-4 cursor-grab items-center justify-center text-white/70 transition-opacity active:cursor-grabbing",
            visible
              ? "opacity-100"
              : "pointer-events-none opacity-0",
          )}
        >
          <GripHorizontal className="size-5 rounded-full bg-black/45 px-0.5" />
        </div>
      )}
      <div
        aria-label="Resize mini-player"
        title="Resize mini-player"
        {...resizeHandlers}
        className={cn(
          "absolute bottom-0 right-0 z-30 size-8 touch-none cursor-nwse-resize transition-opacity",
          visible
            ? "opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />
    </>
  );
}
