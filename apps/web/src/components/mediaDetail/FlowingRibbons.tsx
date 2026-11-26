// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { SilkWaves } from "../home/LibraryScenes";
import { cn } from "@/lib/utils";

/**
 * The home page's silk — the pink and violet ribbons behind the category
 * wall — drifting behind the player while the video plays, whenever the
 * live ambient glow isn't showing.
 *
 * The same component, placed the same way, crossing behind the player. It sways with the Appearance motion setting and holds
 * still under reduced motion, as it does on the home page.
 */
export function FlowingRibbons({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        // The width of the window, from just above the player to just
        // below it, fading out at the top and bottom.
        "pointer-events-none absolute left-1/2 top-[-15%] h-[130%] w-screen -translate-x-1/2 overflow-hidden transition-opacity duration-1000",
        visible ? "opacity-100" : "opacity-0",
      )}
      style={{
        maskImage: "linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)",
      }}
    >
      {/* Placed as on the home page: the box at the right, the pink running
          out to the left across the whole width, so the ribbons cross
          behind the screen and show either side of it. */}
      <SilkWaves className="absolute right-0 top-1/2 h-[75%] w-[45%] -translate-y-1/2 opacity-60" />
    </div>
  );
}
