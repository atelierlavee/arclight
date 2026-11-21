import { Link } from "@tanstack/react-router";
import { Pin } from "lucide-react";
import { useState } from "react";
import { isPinned, togglePin } from "@/lib/pinned";
import { cn } from "@/lib/utils";
import { randomStudioFrame, studioFrameUrl, type StudioSummary } from "@/lib/studioApi";

/**
 * A studio tile, shared by the studios page and the homepage row.
 *
 * 16:9 rather than the performers' 2:3 portrait: the artwork is a frame from
 * one of their videos, and cropping a widescreen still into a portrait throws
 * most of it away. A studio has no artwork of its own — there's no external
 * metadata source here to fetch a logo from.
 *
 * A flat dark overlay covers the whole frame with the name centred over it,
 * so the card reads as a label rather than as a claim about what you're
 * looking at — one scene's still standing in for a whole catalogue. Even
 * rather than graded, so the name sits on the same tone wherever the frame
 * happens to be bright.
 */
export function StudioCard({
  studio,
  className,
  frameItemId: frameOverride,
}: {
  studio: StudioSummary;
  className?: string;
  /**
   * Which frame to show. Defaults to a random one of the studio's videos,
   * chosen once per visit, so the cover changes over time and grows with
   * the studio instead of being the same still forever.
   */
  frameItemId?: number | null;
}) {
  // The count is deliberately not shown: the name is the whole label, and a
  // "1 video" line under half of them made the row read as a list of gaps.
  const [pinned, setPinned] = useState(() => isPinned(`studio:${studio.id}`));
  // Chosen once on mount, so the cover holds still while you are on the page.
  const [randomFrame] = useState(() => randomStudioFrame(studio));
  const frameItemId = frameOverride ?? randomFrame;
  return (
    <div className={`motion-card group relative ${className ?? ""}`}>
      <Link
        to="/studio/$studioId"
        params={{ studioId: String(studio.id) }}
        className="block focus-visible:outline-none"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-secondary ring-1 ring-border transition-all duration-200 group-hover:ring-white/40">
          {frameItemId != null ? (
            <img
              src={studioFrameUrl(studio, frameItemId)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-secondary to-background" />
          )}

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 px-3 text-center transition-colors duration-200 group-hover:bg-black/45">
            <h3 className="sensitive line-clamp-2 text-xl font-semibold leading-tight tracking-tight text-white drop-shadow sm:text-2xl">
              {studio.name}
            </h3>
          </div>
        </div>
      </Link>
      <button
        type="button"
        onClick={() => {
          togglePin({
            id: `studio:${studio.id}`,
            type: "studio",
            label: studio.name,
            studioId: studio.id,
          });
          setPinned((value) => !value);
        }}
        aria-pressed={pinned}
        aria-label={pinned ? `Unpin ${studio.name}` : `Pin ${studio.name}`}
        title={pinned ? "Unpin" : "Pin"}
        className={cn(
          "absolute left-2 top-2 z-10 hidden size-8 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/20 backdrop-blur-sm transition-all hover:bg-black/85 md:flex md:opacity-0 md:group-hover:opacity-100",
          pinned && "md:opacity-100",
        )}
      >
        <Pin className={cn("size-4", pinned && "fill-white")} />
      </button>
    </div>
  );
}
