import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

/**
 * Where a home-page row leads when it has more than it is showing.
 *
 * Typed as a union rather than taking a loose string, so a row cannot link
 * somewhere the router has no route for, and the search params each
 * destination accepts are checked at the call site.
 */
export type SeeMoreDestination =
  | { to: "/performers" }
  | { to: "/studios" }
  | {
      to: "/browse";
      /**
       * Narrower than the route's full search on purpose: a "see more" tile
       * continues one row into the browse page, so it carries the one thing
       * that row was about rather than an arbitrary view.
       */
      search?: {
        tag?: string;
        collectionId?: number;
        sort?: string;
        watched?: string;
        favorite?: string;
        watchLater?: string;
        following?: string;
      };
    };

/**
 * The last tile in a truncated row.
 *
 * A tile rather than a link beside the heading: the rows are scrolled, so the
 * end of one is where you already are when you run out of things to look at,
 * and that is where the way onward should be. A header link asks you to
 * scroll back to a corner you have left behind.
 *
 * It takes the same sizing as the tiles it follows so the row keeps one
 * rhythm, and is drawn as an outline rather than a card, so it reads as the
 * end of the row rather than one more thing in it.
 */
export function SeeMoreTile({
  destination,
  className,
  style,
  aspectRatio,
  label = "See more",
}: {
  destination: SeeMoreDestination;
  /** Sizing from the row, so the tile matches its neighbours. */
  className?: string;
  /**
   * The row's tile width, where it comes from a value rather than a class.
   *
   * Media rows size their tiles from the Appearance panel, so the width is an
   * inline style and not a class — without it this tile shrank to the width
   * of the words inside it and sat as a small box at the end of a full-height
   * row.
   */
  style?: React.CSSProperties;
  /** The shape of the row's tiles. */
  aspectRatio: string;
  label?: string;
}) {
  return (
    <div className={className} style={style}>
      <Link
        {...destination}
        className="group/more flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-transparent hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        style={{ aspectRatio }}
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-secondary/70 transition-transform group-hover/more:translate-x-0.5">
          <ArrowRight className="size-4" />
        </span>
        <span className="text-xs font-medium">{label}</span>
      </Link>
    </div>
  );
}
