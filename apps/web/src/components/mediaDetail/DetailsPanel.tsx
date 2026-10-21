import { Check, Move, Pencil } from "lucide-react";
import { PerformerEditor } from "../PerformerEditor";
import { ClampedText } from "../ClampedText";
import { DescriptionEditor } from "../DescriptionEditor";
import { EditableTitle } from "../EditableTitle";
import { FolderPicker } from "../FolderPicker";
import { StudioEditor } from "../StudioEditor";
import { TagEditor } from "../TagEditor";
import { TechnicalInfoPanel } from "../TechnicalInfoPanel";
import { ThumbnailPicker } from "../ThumbnailPicker";
import { FramingEditor, type FramingValue } from "../FramingEditor";
import { StarRating } from "../StarRating";
import { BookmarkList } from "../BookmarkList";
import { SeriesAssignment } from "../SeriesAssignment";
import type { Bookmark } from "@/lib/bookmarkApi";
import type { Category } from "@/lib/categoryApi";
import { thumbnailUrl, type MediaItemDetail } from "@/lib/mediaItemApi";
import { cardChrome, TILE_SHAPES } from "@/lib/layout";
import { useAppearance } from "@/lib/appearance";
import { cn, formatDuration } from "@/lib/utils";

/**
 * The hero banner's shape, so reframing can preview it alongside the tiles.
 *
 * Derived from the viewport rather than a constant: the hero spans the full
 * width and a chosen fraction of the viewport height, so its ratio is a
 * property of the window and the setting, not of the card system. Falls back
 * to a typical wide banner when there is no window to measure, which keeps
 * this usable under test.
 */
function heroAspect(heroHeightPercent: number): string {
  if (typeof window === "undefined") return "16 / 5";
  const height = (window.innerHeight * heroHeightPercent) / 100;
  return height > 0 && window.innerWidth > 0
    ? `${window.innerWidth} / ${height}`
    : "16 / 5";
}

function FieldLabel({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent?: string | null;
}) {
  return (
    <span
      className="block text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors duration-500"
      style={{ color: accent ?? undefined }}
    >
      {children}
    </span>
  );
}

/** The record of the item below the player: its metadata, and the editors for it. */
export function DetailsPanel({
  item,
  isMobile,
  editing,
  onToggleEditing,
  accent,
  categories,
  bookmarks,
  onJumpToBookmark,
  kindPending,
  onChangeKind,
  reframing,
  setReframing,
  framingSaving,
  onSaveFraming,
}: {
  item: MediaItemDetail;
  isMobile: boolean;
  editing: boolean;
  onToggleEditing: () => void;
  accent: string | null;
  categories: Category[];
  bookmarks: Bookmark[];
  onJumpToBookmark: (seconds: number) => void;
  kindPending: boolean;
  onChangeKind: (kind: string) => void;
  reframing: boolean;
  setReframing: (reframing: boolean) => void;
  framingSaving: boolean;
  onSaveFraming: (next: FramingValue) => void;
}) {
  const { density, heroHeight } = useAppearance();
  return (
    <div className="grid gap-6 p-4 sm:grid-cols-[1.6fr_1fr] sm:p-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{new Date(item.createdAt).getFullYear()}</span>
          {item.durationSeconds !== null && (
            <>
              <span>·</span>
              <span>{formatDuration(item.durationSeconds)}</span>
            </>
          )}
          <span>·</span>
          <StarRating itemId={item.id} rating={item.rating} />
          {/* Nothing to toggle on a phone — the sheet is read-only
              there, so the control that turns editing on goes too. */}
          {!isMobile && (
            <button
              type="button"
              onClick={onToggleEditing}
              aria-pressed={editing}
              aria-label={
                editing ? "Finish editing details" : "Edit details"
              }
              title={editing ? "Done editing" : "Edit details"}
              className={cn(
                "ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
                editing
                  ? "bg-white text-black hover:bg-white/90"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {editing ? (
                <Check className="size-3.5" />
              ) : (
                <Pencil className="size-3.5" />
              )}
              {editing ? "Done" : "Edit"}
            </button>
          )}
        </div>

        {editing ? (
          <>
            <EditableTitle
              itemId={item.id}
              title={item.title}
              className="cursor-text text-lg font-bold hover:underline"
            />
            <DescriptionEditor
              itemId={item.id}
              description={item.description}
            />
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold">{item.title}</h2>
            {item.description && (
              <ClampedText
                text={item.description}
                className="text-sm leading-relaxed text-muted-foreground"
              />
            )}
          </>
        )}

        <div className="space-y-1.5 pt-1">
          <FieldLabel accent={accent}>Performers</FieldLabel>
          <PerformerEditor
            itemId={item.id}
            performers={item.performers}
            source={item.performersSource}
            readOnly={!editing}
          />
        </div>

        {item.itemType === "video" && (
          <div className="space-y-1.5 pt-1">
            <FieldLabel accent={accent}>
              Bookmarks{bookmarks.length > 0 && ` · ${bookmarks.length}`}
            </FieldLabel>
            <BookmarkList itemId={item.id} bookmarks={bookmarks} onJump={onJumpToBookmark} />
          </div>
        )}

        {item.playbackWarning && (
          <p className="rounded-md bg-yellow-500/15 px-3 py-2 text-sm text-yellow-500">
            {item.playbackWarning}
          </p>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <FieldLabel accent={accent}>Category</FieldLabel>
          {editing ? (
            <select
              value={item.kind}
              onChange={(e) => onChangeKind(e.target.value)}
              disabled={kindPending}
              className="w-full rounded-md border border-border bg-secondary/60 px-2 py-1.5 text-sm outline-none focus:border-ring/60 disabled:opacity-50"
            >
              {categories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.label}
                </option>
              ))}
              {/* An item can hold a slug whose category was deleted;
                without this the select would silently show the first
                option and misrepresent what's stored. */}
              {!categories.some((c) => c.slug === item.kind) && (
                <option value={item.kind}>{item.kind}</option>
              )}
            </select>
          ) : (
            <span
              className="text-sm font-medium transition-colors duration-500"
              style={{ color: accent ?? undefined }}
            >
              {categories.find((c) => c.slug === item.kind)?.label ??
                item.kind}
            </span>
          )}
        </div>

        {editing && (
          <div className="space-y-1.5">
            <FieldLabel accent={accent}>Thumbnail</FieldLabel>
            <ThumbnailPicker
              itemId={item.id}
              hasCustom={item.thumbnailFile !== null}
              onUploaded={() => setReframing(true)}
            />

            {reframing ? (
              <FramingEditor
                src={thumbnailUrl(item)}
                value={{
                  x: item.thumbnailPositionX,
                  y: item.thumbnailPositionY,
                  scale: item.thumbnailScale,
                }}
                aspectClass="aspect-video"
                // Every shape this one value has to satisfy, rather
                // than the one tile shape that happens to be selected.
                // Previewing a single frame was what made the other
                // shapes unreachable: whichever axis that frame does
                // not crop cannot be dragged, so the hero's vertical
                // framing could never be set from either tile.
                //
                // Ratios come from cardChrome rather than written out
                // as classes, so tuning the portrait shape moves these
                // previews with it.
                previews={[
                  ...TILE_SHAPES.map((shape) => ({
                    label: shape.label,
                    aspectRatio: cardChrome(density, "none", shape.value)
                      .aspectRatio,
                  })),
                  { label: "Hero", aspectRatio: heroAspect(heroHeight) },
                ]}
                saving={framingSaving}
                onSave={onSaveFraming}
                onCancel={() => setReframing(false)}
                note="Used everywhere this image appears — tile, hover card, search row and the hero banner."
              />
            ) : (
              <button
                type="button"
                onClick={() => setReframing(true)}
                className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5 text-xs transition-colors hover:bg-accent"
              >
                <Move className="size-3.5" />
                Reposition
              </button>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <FieldLabel accent={accent}>Studio</FieldLabel>
          <StudioEditor
            itemId={item.id}
            studio={item.studio}
            readOnly={!editing}
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel accent={accent}>Tags</FieldLabel>
          <TagEditor
            itemId={item.id}
            tags={item.tags}
            readOnly={!editing}
            accent={accent}
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel accent={accent}>Details</FieldLabel>
          <TechnicalInfoPanel item={item} />
        </div>

        {editing && (
          <FolderPicker itemId={item.id} parentId={item.parentId} />
        )}
        {editing && item.itemType === "video" && <SeriesAssignment item={item} />}
      </div>
    </div>
  );
}
