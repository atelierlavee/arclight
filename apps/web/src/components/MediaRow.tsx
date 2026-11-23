// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { MediaCard, type MediaCardItem } from "./MediaCard";
import { ContextMenu } from "./ContextMenu";
import { ScrollRow } from "./ScrollRow";
import { SeeMoreTile, type SeeMoreDestination } from "./SeeMoreTile";
import { tileWidthPx, useAppearance } from "@/lib/appearance";
import { cardLayout, tileWidthFraction } from "@/lib/layout";
import { useTileMenu } from "@/lib/tileMenu";

export function MediaRow({
  title,
  titleClassName,
  itemClassName,
  action,
  seeMore,
  items,
  loading = false,
  onSelectItem,
  onPlayItem,
  onOpenFolder,
}: {
  title: string;
  /** Passed straight through to ScrollRow; see the note there. */
  titleClassName?: string;
  /**
   * Escape hatch for a row that genuinely needs a different tile. Left unset,
   * every row takes its width from the Appearance panel, so one size is
   * shared by the whole app.
   */
  itemClassName?: string;
  /** Passed straight through to ScrollRow; see the note there. */
  action?: React.ReactNode;
  /**
   * Where the row leads when it is showing only the first few. Rendered as a
   * final tile, so it is found at the end of a scroll rather than back at the
   * heading you scrolled away from.
   */
  seeMore?: SeeMoreDestination;
  items: MediaCardItem[];
  /**
   * Holds the row open with placeholder tiles while its query is in flight.
   * Without it the row is simply absent until the data lands, so the home page
   * shuffles itself as each request returns.
   */
  loading?: boolean;
  onSelectItem: (id: number) => void;
  onPlayItem?: (id: number) => void;
  onOpenFolder: (id: number, title: string) => void;
}) {
  const { tileSizePercent, tileInfo, viewMode, tileShape, density } =
    useAppearance();
  // Same derivation the grid uses, so a row and the grid below it agree about
  // how big a card is instead of drifting apart mode by mode.
  const layout = cardLayout(
    tileWidthPx(tileSizePercent),
    viewMode,
    density,
    tileInfo,
    tileShape,
  );
  const tileWidth = layout.widthPx;
  // The same menu the library grid has, so a tile offers the same actions
  // wherever it is drawn. Rows had none at all, which is why setting a tile's
  // shape only worked on one page.
  const { menu, setMenu, openMenu } = useTileMenu({
    onOpenFolder,
    onEdit: onSelectItem,
  });
  // About what a wide row shows at the default tile size — enough to read as a
  // full row, few enough that the last ones aren't wasted work off-screen.
  const placeholderCount = 6;

  // Same width rule and aspect as a real tile, so nothing shifts when the
  // placeholders are replaced by the cards themselves.
  const tileStyle = itemClassName
    ? undefined
    : { width: `min(${tileWidth}px, 80vw)` };

  /**
   * One tile's width, narrowed when its own shape is taller than the row's.
   *
   * Given to the flex item rather than to the card inside it. Narrowing the
   * card instead leaves it centred in a full-width slot, so a row of portrait
   * tiles is mostly the gaps between them — which is exactly how it looked.
   * Shrinking the slot lets the row's own gap do the spacing, as it does for
   * every other tile.
   */
  function styleFor(item: MediaCardItem) {
    if (itemClassName) return undefined;
    const fraction = tileWidthFraction(item.tileShape ?? tileShape, tileShape);
    return { width: `min(${Math.round(tileWidth * fraction)}px, 80vw)` };
  }

  return (
    <ScrollRow
      title={title}
      titleClassName={titleClassName}
      action={action}
      itemCount={items.length}
      loading={loading}
    >
      {loading
        ? Array.from({ length: placeholderCount }).map((_, index) => (
            <div
              key={`placeholder-${index}`}
              className={itemClassName ?? "shrink-0"}
              style={tileStyle}
            >
              <div
                className="skeleton w-full rounded-md"
                style={{ aspectRatio: layout.aspectRatio }}
              />
            </div>
          ))
        : items.map((item) => (
            <div
              key={item.id}
              className={itemClassName ?? "shrink-0"}
              // min() rather than a flat width: on a phone a 416px tile would
              // be wider than the screen, and the row would scroll one tile at
              // a time.
              style={styleFor(item)}
            >
              <MediaCard
                item={item}
                // The slot above is already this tile's shape, so the card
                // must not narrow itself again inside it.
                shapeSizedByContainer
                onClick={() =>
                  item.itemType === "folder"
                    ? onOpenFolder(item.id, item.title)
                    : onSelectItem(item.id)
                }
                onPlay={onPlayItem ? () => onPlayItem(item.id) : undefined}
                onContextMenu={(event) => openMenu(event, item)}
              />
            </div>
          ))}

      {!loading && seeMore && items.length > 0 && (
        <SeeMoreTile
          destination={seeMore}
          className={itemClassName ?? "shrink-0"}
          // The same width the real tiles get, or this ends up as wide as the
          // words inside it.
          style={tileStyle}
          aspectRatio={layout.aspectRatio}
        />
      )}

      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </ScrollRow>
  );
}
