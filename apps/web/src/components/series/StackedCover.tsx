// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { Film } from "lucide-react";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { cn } from "@/lib/utils";

/**
 * A series' first episodes fanned out like a small deck of cards — the
 * series at a glance. On hover (of this or an enclosing `group`) the back
 * cards swing further out and the front one lifts, like opening a hand.
 */
export function StackedCover({
  items,
  poster,
  className,
}: {
  /** The first few episodes, in order; the first is drawn on top. */
  items: { id: number; thumbnailFile?: string | null }[];
  /** An uploaded series poster: the top card, with the episodes beneath. */
  poster?: string | null;
  className?: string;
}) {
  const cards: { key: string; src: string }[] = [
    ...(poster ? [{ key: "poster", src: poster }] : []),
    ...items.map((item) => ({ key: String(item.id), src: thumbnailUrl(item) })),
  ].slice(0, 3);
  // At rest, and — on hover — fanned further. Offsets are a share of the
  // cover's width, so the fan keeps its shape at any size.
  const tilt = [
    "rotate-0 group-hover:-translate-y-1 group-hover:scale-[1.03]",
    "rotate-3 translate-x-[7%] group-hover:rotate-[9deg] group-hover:translate-x-[20%]",
    "-rotate-6 -translate-x-[8%] group-hover:-rotate-[13deg] group-hover:-translate-x-[20%]",
  ];
  return (
    <div
      className={cn(
        "relative aspect-video",
        // Room above and below for a poster standing taller than the stack
        // (vertical % margins are of the width: 20% of a 16:9 height ≈ 11%).
        poster && "my-[11%]",
        className,
      )}
    >
      {cards.length === 0 ? (
        <div className="flex size-full items-center justify-center rounded-2xl bg-secondary">
          <Film className="size-6 text-muted-foreground" />
        </div>
      ) : (
        // Back to front: the poster (or else the first episode) on top.
        [...cards].reverse().map((card, index) => {
          const depth = cards.length - 1 - index;
          const motion =
            "transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]";
          const look = "sensitive rounded-2xl shadow-[0_20px_45px_-15px_rgba(0,0,0,0.9)] ring-1 ring-white/15";
          // The poster keeps its own shape — portrait box art, square, wide —
          // fitted inside the cover, never cropped or zoomed.
          if (card.key === "poster") {
            return (
              <div key={card.key} className="absolute inset-0 flex items-center justify-center">
                <img
                  src={card.src}
                  alt=""
                  loading="lazy"
                  className={cn("max-h-[140%] max-w-full", look, motion, tilt[0])}
                />
              </div>
            );
          }
          return (
            <img
              key={card.key}
              src={card.src}
              alt=""
              loading="lazy"
              className={cn(
                "absolute inset-0 size-full object-cover",
                look,
                motion,
                tilt[depth] ?? "",
                depth > 0 && "scale-[0.92] opacity-80",
              )}
            />
          );
        })
      )}
    </div>
  );
}
